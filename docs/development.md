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

`npm run test:e2e` first runs `npm run build` (electron-vite build plus the MCP shim build, see "Connecting an MCP client" above), then drives the **real production build** (`out/main/index.js`) through Playwright's `_electron` fixture — real preload bridge, real IPC, real SQLite, strict production CSP. Specs run serially (one worker, no retries, 60s timeout). Among the specs in `e2e/`:

| Spec                              | Covers                                                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hoy-export.spec.ts`              | App launches, Hoy renders with zero navigation, JSON export writes a real file                                                                                             |
| `claude-connection.spec.ts`       | Ajustes probes the installed CLI and reports connected with version and path                                                                                               |
| `ask-my-materials.spec.ts`        | The ask panel opens from Hoy, is wired end to end, and closes cleanly                                                                                                      |
| `ask-history-persistence.spec.ts` | A conversation written before relaunch is resumed after relaunch (same user-data dir)                                                                                      |
| `attachment-indexing.spec.ts`     | Sincronizar indexes pending and ai-generated attachments; chunks are BM25-retrievable                                                                                      |
| `mcp-round-trip.spec.ts`          | An external process spawns the real MCP shim, keeps stdout pure under load, and fails closed when the app is not running, the token is wrong, or the app quits mid-session |

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

### Development seed

`npm run db:seed` fills the dev database with a realistic academic history — two programs (one `numerico` carrera, one `binario` course), five períodos, nineteen materias across cursadas past and present, correlativas, horarios, entregas, parciales, finales, asistencia and a próximo-período draft — so every screen has something true-to-life to render.

| Command                          | Effect                                                   |
| -------------------------------- | -------------------------------------------------------- |
| `npm run db:seed`                | Appends the dataset to the dev database in `userData`.   |
| `npm run db:seed -- --reset`     | Clears the academic tables first (see the caveat below). |
| `npm run db:seed -- --db <path>` | Targets another database file, e.g. a scratch copy.      |

- The dataset is anchored to **the day the seed runs**, not to hardcoded years: a cursada is always in progress, parciales were just taken, and some entregas are due this week. `buildSeedData(today)` is pure and unit-tested (`tooling/seedDatabase.test.ts`).
- The seed runs the production migrator first, so it also works against a database file that does not exist yet.
- `--reset` deletes the academic tables (programs down to attendance) but **not** the attachment FILES already copied into `userData/attachments`; conversations, ask history and `app_settings` are never touched.

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

## Connecting an MCP client

Course Companion runs an inbound [MCP](https://modelcontextprotocol.io) server so an MCP-capable client (Claude Code, Claude Desktop, or another CLI) can read and write your academic data directly. The app itself never opens a network port: an external client spawns a small relay ("the shim") that talks to the running app over a local named pipe (Windows) or Unix socket (elsewhere).

**Prerequisites**: Course Companion must be running, with a token issued and at least one slice granted from Ajustes; **system Node.js >= 20 must be on `PATH`** — the client spawns the shim with your own `node`, never Electron's bundled one.

### Client configuration

Point your MCP client at the shim with the same `{ command, args, env }` shape most stdio-based clients use:

```json
{
  "mcpServers": {
    "course-companion": {
      "command": "node",
      "args": ["<install-dir>/resources/mcp-shim/index.cjs"],
      "env": {
        "COURSE_COMPANION_MCP_TOKEN": "<the token from Ajustes>"
      }
    }
  }
}
```

- **After install**, the shim lives at `<install-dir>/resources/mcp-shim/index.cjs` (outside `app.asar`, since the client's system Node needs to read it directly). Ajustes' MCP card shows this exact path once it ships.
- **Running from source** instead, point `args` at `out/mcp-shim/index.cjs` (repo root, after `npm run build`).
- The token is shown in plaintext exactly once, when it is issued or rotated in Ajustes — supply it to the client only through `env`, never on the command line: it is validated during the connection handshake, before any tool call is dispatched.

### When it will not connect

The shim never launches the app on your behalf, never opens the database itself, and never queues a call while disconnected — on any failure it exits with one diagnostic line on stderr instead of touching stdout, so a client's own error surface is what you should check first.

| Symptom                                                              | Cause                                                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The client reports the server exited immediately and no tools appear | Course Companion is not running, or MCP is not enabled (no token issued, or no slice granted)                                          |
| Same symptom, but the app _is_ running                               | The token in the client's `env` does not match the one currently issued — reissue or rotate it in Ajustes and update the client config |
| The client was working, then the connection dropped mid-session      | The app was closed or restarted; reconnect once it is running again                                                                    |

## Conventions

- **Prettier**: no semicolons, single quotes, no trailing commas, 120-column print width. LF line endings are enforced for all text files via `.gitattributes`.
- **TypeScript 7 (native compiler).** The architecture guard does not depend on the `typescript` package: dependency-cruiser (which supports only `<7.0.0` and passed vacuously under TS 7) was replaced by the in-repo `tooling/dependencyGuard.mts`, which parses with `@swc/core`. The guard script runs directly under Node's native type stripping (Node 22.18+), no build step involved.
- **Colocated tests**, named `*.test.ts` / `*.test.tsx`.
- **Spanish domain terms** in identifiers (materias, entregas, hoy, adjuntos, ajustes, carreras, finales, horario) are intentional — the domain language is the user's language. Code comments and infrastructure naming are in English.
- **UI copy is in Spanish**; dark is the default theme, and a light theme follows the OS preference: a `prefers-color-scheme: light` media query in `src/renderer/shared/styles/globals.css` overrides the raw design tokens (the semantic aliases and Tailwind utilities follow via `var()`), while per-row subject colours applied as inline styles are mapped at render time through `src/renderer/shared/lib/subjectColorScheme.ts`.
- `design/course-companion` (encrypted Pencil file) is the visual source of truth — do not hand-edit or diff it; it is marked binary in `.gitattributes`.
