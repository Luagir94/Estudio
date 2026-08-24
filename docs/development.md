# Development Guide

Everything you need to work on Course Companion day to day: setup, testing, database migrations, architecture rules, and packaging.

## Setup

1. Install Node.js 22.18 or newer (24 LTS recommended) — enforced via the `engines` field; the dependency guard runs TypeScript directly through Node's built-in type stripping.
2. On Windows, make sure a native build toolchain is available (Visual Studio Build Tools with the C++ workload, plus Python). `better-sqlite3` is a native module.
3. Clone and install:

```sh
npm install
```

`postinstall` runs `electron-rebuild -f -w better-sqlite3`, recompiling the SQLite driver against Electron's ABI (Electron's Node version differs from your system Node, so the prebuilt binary will not load without this).

## Day-to-day

| Task                                 | Command                |
| ------------------------------------ | ---------------------- |
| Dev server with hot reload           | `npm run dev`          |
| Type checking (node + web tsconfigs) | `npm run typecheck`    |
| Lint (ESLint, flat config)           | `npm run lint`         |
| Format                               | `npm run format`       |
| Format check only                    | `npm run format:check` |

## Testing

### Unit tests (Vitest)

- Tests are **colocated**: `foo.test.ts` next to `foo.ts`, plus `tooling/**/*.test.ts`.
- The default environment is `node`. Renderer component/container tests opt into a DOM per file with a docblock as the first line:

```ts
// @vitest-environment jsdom
```

- Run with `npm run test:unit` (single run) or `npm run test:watch`.

### The dependency-guard tests

`tooling/dependencyGuard.test.ts` covers the in-repo dependency guard (`tooling/dependencyGuard.mts`): it scans committed fixture files that deliberately violate the two architecture rules and asserts the violations are reported (including a type-only electron import, which rule 1 deliberately flags), verifies the type-only exemption clears a compliant `child_process` fixture, asserts the real `src/` scan stays above the same minimum-module threshold the CLI itself enforces, and spawns the `lint:deps` CLI to prove the entrypoint actually runs and reports. The threshold and CLI assertions exist because the guard's predecessor once "passed" while scanning zero modules — a vacuous or collapsed scan now fails both gates.

### End-to-end tests (Playwright)

`npm run test:e2e` first runs `electron-vite build`, then drives the **real production build** (`out/main/index.js`) through Playwright's `_electron` fixture — real preload bridge, real IPC, real SQLite, strict production CSP. Specs run serially (one worker, no retries, 60s timeout). The five specs in `e2e/`:

| Spec                              | Covers                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `hoy-export.spec.ts`              | App launches, Hoy renders with zero navigation, JSON export writes a real file        |
| `claude-connection.spec.ts`       | Ajustes probes the installed CLI and reports connected with version and path          |
| `ask-my-materials.spec.ts`        | The ask panel opens from Hoy, is wired end to end, and closes cleanly                 |
| `ask-history-persistence.spec.ts` | A conversation written before relaunch is resumed after relaunch (same user-data dir) |
| `attachment-indexing.spec.ts`     | Sincronizar indexes pending and ai-generated attachments; chunks are BM25-retrievable |

Note: `claude-connection.spec.ts` expects a locally installed Claude Code CLI to resolve.

### What `npm test` runs

`npm test` = `format:check` + `test:unit` + `lint:deps` + `lint`. It does **not** run `typecheck` or `test:e2e` — run those explicitly before considering a change done.

### Linting (ESLint)

`npm run lint` runs ESLint over the repo with the flat config in `eslint.config.mjs`: `@eslint/js` + `typescript-eslint` recommended (non-type-checked — typechecking is `npm run typecheck`'s job), `eslint-plugin-react-hooks` recommended on renderer/preload code, `eslint-plugin-jsx-a11y` recommended on TSX, and `eslint-config-prettier` last so formatting stays Prettier's. Unused `eslint-disable` directives are errors, so every suppression in the codebase is load-bearing.

One wrinkle: typescript-eslint's parser needs the classic TypeScript compiler API, which the native TS 7 package no longer ships. The `overrides` block in `package.json` pins a classic `typescript@6.0.3` for the lint toolchain only — it nests under `node_modules/typescript-eslint/` and does not affect `tsc`, which stays on the native TS 7 at the root.

## Database workflow

1. Edit `src/main/db/schema.ts`.
2. Run `npm run db:generate` — drizzle-kit authors a new SQL migration in `drizzle/migrations/`.
3. Start the app. Migrations are applied **forward-only at startup** (`src/main/db/migrate.ts`); when one is pending, the DB file is automatically backed up first as `course-companion.db.bak-<n>` in `userData`.

Rules:

- There is no `db:migrate` script — the app itself is the migrator.
- Never edit a migration that has been applied; author a new one.
- Migrations are bundled into the packaged app (`electron-builder.yml` includes `drizzle/migrations/**/*`), so users are migrated on update with the same backup-first policy.

## Architecture rules in practice

`npm run lint:deps` (also part of `npm test`) runs the in-repo guard `tooling/dependencyGuard.mts`. The two rules it enforces, and the import forms it covers, are specified in [architecture.md — Enforced boundaries](architecture.md#enforced-boundaries); that section is the normative list.

Checklist for a new feature slice:

- [ ] `src/shared/ipc/<slice>.ts` — Zod input/output schemas; reuse the `IpcResult` envelope.
- [ ] `src/main/<slice>/domain/` — pure logic; `adapters/` — SQLite repository; `ipc/register<Slice>Handlers.ts` — parse payloads, return `ipcOk`/`ipcErr`; a `<slice>Service.ts` only if orchestration warrants it.
- [ ] Wire the repository/handlers in `bootstrap()` in `src/main/index.ts`.
- [ ] Add a typed group to the `api` object in `src/preload/index.ts` — **type-only** imports from `shared/ipc/*`.
- [ ] `src/renderer/<slice>/domain/`, `adapters/` (calls `window.api`, Zod-parses responses), `containers/` (TanStack Query), `components/` (presentational).
- [ ] Colocate tests at every layer; add `// @vitest-environment jsdom` to component/container tests.

## Packaging

```sh
npm run dist:win
```

Builds production output and runs electron-builder for Windows. The NSIS installer (not one-click; user-selectable install directory) lands in `release/` as `Course Companion-<version>-setup.exe`. Electron Fuses are flipped into the binary at package time — the shipped app cannot run as a Node interpreter, ignores `NODE_OPTIONS`, and only loads its integrity-checked `app.asar`. Packaging is Windows-only today.

## Conventions

- **Prettier**: no semicolons, single quotes, no trailing commas, 120-column print width. LF line endings are enforced for all text files via `.gitattributes`.
- **TypeScript 7 (native compiler).** The architecture guard does not depend on the `typescript` package: dependency-cruiser (which supports only `<7.0.0` and passed vacuously under TS 7) was replaced by the in-repo `tooling/dependencyGuard.mts`, which parses with `@swc/core`. The guard script runs directly under Node's native type stripping (Node 22.18+), no build step involved.
- **Colocated tests**, named `*.test.ts` / `*.test.tsx`.
- **Spanish domain terms** in identifiers (materias, entregas, hoy, adjuntos, ajustes, carreras, finales, horario) are intentional — the domain language is the user's language. Code comments and infrastructure naming are in English.
- **UI copy is in Spanish**; the theme is dark-only.
- `design/course-companion` (encrypted Pencil file) is the visual source of truth — do not hand-edit or diff it; it is marked binary in `.gitattributes`.
