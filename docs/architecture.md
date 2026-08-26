# Architecture

Course Companion is an Electron app organized as feature slices (screaming architecture), where each slice carries its own hexagonal layers. The main process owns all persistence and every subprocess; the renderer is a sandboxed React app that talks to main exclusively through Zod-validated IPC contracts. The architectural boundaries are enforced by an in-repo dependency guard that runs as part of `npm test` and is itself covered by tests against committed violation fixtures.

```
src/
├── main/                  # Electron main process
│   ├── index.ts           # bootstrap() — the composition root
│   ├── window.ts          # window creation + security baseline (CSP, isolation)
│   ├── db/                # connection, Drizzle schema, startup migration
│   ├── adjuntos/          # feature slices: domain/ · adapters/ · ipc/ · <slice>Service.ts
│   ├── app/               #   (export menu, external links)
│   ├── ask/               #   (AI Q&A service + history)
│   ├── carreras/
│   ├── claude/            #   (executable validation, warm CLI session)
│   ├── cli/               #   (provider probe, model catalog)
│   ├── entregas/
│   ├── finales/
│   ├── horario/
│   ├── hoy/
│   └── materias/
├── preload/
│   └── index.ts           # thin typed forwarder (contextBridge)
├── renderer/              # React app
│   ├── App.tsx            # provider stack (query client, router, error boundary)
│   ├── router.tsx         # route tree — every address the app has
│   ├── Shell.tsx          # sidebar + routed main region + Ask panel
│   ├── navigation.ts      # sidebar domain <-> path map
│   ├── adjuntos/ ajustes/ ask/ carreras/ entregas/
│   ├── finales/ horario/ hoy/ materias/
│   │                      # each: domain/ · adapters/ · containers/ · components/
│   └── shared/            # vendored shadcn/ui primitives, styles, hooks, lib
└── shared/
    └── ipc/               # one Zod contract module per domain + channels.ts
```

## Process model

| Process  | Responsibility                                                                               | Built by electron-vite to |
| -------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| Main     | Window lifecycle, SQLite, migrations, all IPC handlers, CLI subprocesses, native menu        | `out/main`                |
| Preload  | Exposes one typed `window.api` object via `contextBridge`; forwards calls, validates nothing | `out/preload`             |
| Renderer | React UI; never imports Node or Electron APIs                                                | `out/renderer`            |

The preload is sandboxed, so it imports only `type`s from `src/shared/ipc/*` (erased at compile time) plus the dependency-free `channels.ts` — a runtime import of any Zod-using module would break the sandboxed bundle.

## Feature slices and hexagonal layers

Every domain (materias, entregas, hoy, ...) is a vertical slice that appears on both sides of the IPC boundary, with the same layer discipline:

```
src/main/<slice>/                     src/renderer/<slice>/
├── domain/          # pure logic     ├── domain/       # pure logic, no React
├── adapters/        # SQLite, fs     ├── adapters/     # window.api + Zod parse
├── ipc/             # handler reg.   ├── containers/   # hooks, TanStack Query
└── <slice>Service.ts # orchestration └── components/   # presentational only
```

- **Domain** layers are framework-free. Renderer domain modules may not import Electron or the SQLite driver (machine-enforced, see below).
- **Container/presentational** is enforced by convention: containers own data fetching and state; components receive props and render.
- **Composition root**: `bootstrap()` in `src/main/index.ts` is the one place adapters are constructed and wired into services and handlers. Repositories are deliberately shared between slices that read the same data (e.g. `horario:week` is a read-only projection over the same repository `materias:list` uses).

## IPC contract

All renderer–main traffic goes over `ipcRenderer.invoke` channels (38 of them, plus one push event for the native File menu's export item).

- **Shared Zod schemas** live in `src/shared/ipc/<domain>.ts` and are parsed on **both** sides: main parses incoming payloads before executing; the renderer adapter parses responses before handing them to TanStack Query.
- **Envelope**: every handler returns a discriminated `IpcResult<T>` — `{ ok: true, data } | { ok: false, error: { code, message } }` (defined in `src/shared/ipc/materias.ts`). Nothing throws across the bridge.
- **Thin preload**: `src/preload/index.ts` only forwards; it never parses.

A `materias:create` call, traced end to end:

1. `MateriasContainer` (renderer container) submits a form and calls the slice adapter.
2. `materiasApi` (renderer adapter) calls `window.api.materias.create(input)`.
3. Preload forwards it as `ipcRenderer.invoke('materias:create', input)`.
4. `registerMateriasHandlers` (main) parses the payload with `createSubjectInputSchema`, rejecting invalid input with an `ipcErr`.
5. The handler executes against `sqliteSubjectRepository` (subject + slots in one transaction) and returns `ipcOk(subjectWithSlots)`.
6. The renderer adapter Zod-parses the response, and TanStack Query caches it.

## Data layer

SQLite via `better-sqlite3` and Drizzle ORM. The database lives at `userData/course-companion.db`; attachment files are copied to `userData/attachments/<subjectId>/` and referenced by userData-relative paths so the DB never contains machine-specific roots.

| Table                   | Purpose                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `programs`              | A carrera or standalone course; grading scheme and scale            |
| `periods`               | Named date intervals within a program (cuatrimestres, cursos, ...)  |
| `subjects`              | The aggregate root: name, teacher, notes, period, outcome, grade    |
| `schedule_slots`        | Weekly class slots, owned by a subject (no independent lifecycle)   |
| `deadlines`             | Dated deliverables, owned by a subject                              |
| `final_exams`           | Final-exam sittings ("mesas") per subject                           |
| `attachments`           | Files attached to a subject; row is source of truth, file is a copy |
| `conversations`         | Ask-panel Q&A threads (global, not subject-scoped)                  |
| `ask_messages`          | One completed Q&A turn per row, with answer kind and model          |
| `ask_message_citations` | Normalized citations attached to a message                          |
| `app_settings`          | Generic key/value store (e.g. the CLI executable override)          |

Schema: `src/main/db/schema.ts`. Migrations are authored with `npm run db:generate`, bundled into the packaged app (`drizzle/migrations/`), and applied **forward-only at startup** by `src/main/db/migrate.ts` — when a migration is pending, the DB file is first copied aside as `course-companion.db.bak-<n>` before the migrator runs.

## Navigation

Screens are addresses. `src/renderer/router.tsx` is the renderer's navigation composition root — the one module that names every domain and every path — and it is deliberately the counterpart of `bootstrap()` on the main side rather than a `shared/` module.

- **TanStack Router over hash history.** The window loads over `file://`, where a path history has no server to fall back on; a hash keeps every screen in `window.history`, so a reload resumes where you were and Alt+Left and the mouse's back button work with nothing wired in the renderer. The main process's `will-navigate` lockdown compares origin and pathname, neither of which a hash touches, so the security baseline is untouched.
- **Flat routes, thin adapters.** Each screen declares its full path; there is no per-domain chrome to hang a layout route off. The route components only translate a path into the props feature containers already take (`subjectId`, `onBack`, `onSelectPeriod`), so containers stay prop-driven and router-unaware — and testable without a router.
- **Ids are validated at the boundary.** A path segment is a string, so every `$id` route parses through `parseRouteId` and redirects on anything that is not a positive safe integer. Without it, `Number('abc')` would put `NaN` in a query key and send it over IPC.
- **Two crash boundaries, one screen.** The router installs its own boundary around each routed screen, so a screen's render throw never reaches the root `ErrorBoundary`. Both render `CrashFallback`, so which one caught it is invisible.

| Path                                                                             | Screen                   |
| -------------------------------------------------------------------------------- | ------------------------ |
| `/`                                                                              | redirects to `/hoy`      |
| `/hoy` · `/planificador` · `/horario` · `/entregas` · `/ajustes`                 | one container each       |
| `/materias` · `/materias/$subjectId`                                             | list · subject detail    |
| `/carreras` · `/carreras/$programId` · `/carreras/$programId/periodos/$periodId` | list · carrera · período |

## Security model

- **Renderer isolation**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (`src/main/window.ts`).
- **Strict CSP** in production (`default-src 'self'`; scripts only from `'self'`); a dev-only relaxation exists solely for the Vite React Refresh preamble.
- **Navigation lockdown**: a deny-all `setWindowOpenHandler` plus a `will-navigate` guard that pins the main frame to the document it loaded.
- **Electron Fuses** (flipped at package time via `electron-builder.yml`): `runAsNode` off, `NODE_OPTIONS` and Node CLI inspect arguments off, cookie encryption on, ASAR integrity validation on, `onlyLoadAppFromAsar` on.
- **Sole spawn site**: only `src/main/claude/claudeExecutableValidator.ts` may import `child_process` — machine-enforced across `src/` by the dependency guard (build scripts and e2e specs live outside that enforcement). Every CLI launch passes its pre-spawn validation, user text travels over **stdin, never argv**, and model ids must match a construct-time character allowlist before they may reach a command line.

## Enforced boundaries

The architecture is machine-checked, not aspirational. `tooling/dependencyGuard.mts` is an in-repo guard that parses every `src/` module with `@swc/core` and enforces two rules, run by `npm run lint:deps` (part of `npm test`):

1. `no-electron-or-sqlite-in-domain` — renderer `domain/` layers may not import `electron` or `better-sqlite3`.
2. `child-process-only-in-claude-validator` — no module under `src/` except the executable validator may import `child_process` (`node:` specifier included; type-only imports exempt, since they carry no runtime footprint). Rule 1 deliberately has **no** type-only exemption: naming Electron types already couples a domain module to the framework.

The guard covers static imports, re-exports, dynamic `import()` (string and no-substitution template literals), `require()`, `import =`, and type-position `import()` forms across `.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs`, and it refuses to pass when the scan drops below a minimum module count shared with the test suite — a guard that sees (almost) nothing proves nothing. It replaced dependency-cruiser, which has no TypeScript 7 support and passed vacuously under it.

`tooling/dependencyGuard.test.ts` proves the rules actually fire by scanning committed fixture files that violate them on purpose (value and type-only variants), proves the type-only exemption clears a compliant fixture, asserts the real `src/` scan stays above the shared minimum-module threshold, and spawns the `lint:deps` CLI itself to prove the entrypoint runs and reports. A rule that silently stopped matching — or a scan that collapsed — fails the unit suite and the CLI gate alike.

## Design source and deliberate omissions

- `design/course-companion` is an encrypted Pencil (`.pen`) design file — the visual source of truth for the UI, edited with Pencil tooling and marked binary in `.gitattributes`.
- **Windows-only packaging**: `dist:win` (NSIS) is the only distribution target today.
