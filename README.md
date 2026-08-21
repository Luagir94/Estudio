# Course Companion

A local-first desktop app for managing day-to-day university coursework: subjects, weekly schedule, deadlines, final exams, academic programs, and an AI assistant that answers questions about your own course data. Built for an Argentine university student — the app UI is in Spanish. Everything lives in a SQLite database on your machine: no cloud, no account, no telemetry.

## Features

| Screen       | What it does                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hoy**      | Daily dashboard — today's classes and upcoming work, rendered on launch                                                                     |
| **Materias** | Subject CRUD: teacher, campus URL, notes, attendance %, weekly slots, file attachments, final-exam sittings ("mesas"), close-out with grade |
| **Horario**  | Weekly schedule grid — a read-only projection of subject slots                                                                              |
| **Entregas** | Deadlines with due dates and urgency                                                                                                        |
| **Carreras** | Programs with academic periods and a grading scheme                                                                                         |
| **Ajustes**  | AI CLI connection settings (detection, manual path override, model list)                                                                    |

Cross-cutting:

- **"Preguntar sobre mi cursada"** — an AI Q&A panel available from any screen, with durable conversation history.
- **JSON export** — one-click export of all data, from the sidebar or the native File menu.

## How the AI assistant works

The ask panel shells out to a CLI you already have installed locally — Claude Code, Antigravity (`agy`) or Codex — using your own subscription. The app embeds no API key and calls no hosted API of its own. Every answer is typed: grounded in your course data with citations, general knowledge (visibly marked as such), or "not found". Your data stays on disk; only the question and relevant context go to the CLI process you installed and control.

## Quick start

Prerequisites:

- Node.js 22.18 or newer (24 LTS recommended) — the architecture guard runs TypeScript directly through Node's built-in type stripping.
- Native build tooling on Windows (Visual Studio Build Tools with C++, plus Python) — `better-sqlite3` is a native module and `npm install` rebuilds it against Electron's ABI.

```sh
git clone <repo-url>
cd study
npm install
npm run dev
```

To produce the installable Windows build:

```sh
npm run dist:win
```

The NSIS installer lands in `release/`. Packaged builds are Windows-only today.

## Scripts

| Script         | What it runs                                                        |
| -------------- | ------------------------------------------------------------------- |
| `dev`          | electron-vite dev server with hot reload                            |
| `build`        | Production build to `out/`                                          |
| `typecheck`    | `tsc --noEmit` over both the node and web tsconfigs                 |
| `test:unit`    | Vitest, single run                                                  |
| `test:watch`   | Vitest in watch mode                                                |
| `test:e2e`     | Production build, then Playwright against the real app              |
| `test`         | `format:check` + `test:unit` + `lint:deps` (not typecheck, not e2e) |
| `lint:deps`    | In-repo architecture dependency guard over `src/`                   |
| `format`       | Prettier, write mode                                                |
| `format:check` | Prettier, check mode                                                |
| `db:generate`  | Authors a new Drizzle migration from schema changes                 |
| `postinstall`  | `electron-rebuild` for `better-sqlite3`                             |
| `dist:win`     | Production build + electron-builder NSIS installer                  |

## Tech stack

| Concern              | Choice                                                           |
| -------------------- | ---------------------------------------------------------------- |
| Shell                | Electron 43 + electron-vite 5                                    |
| UI                   | React 19, TypeScript 7 (native compiler)                         |
| Styling              | Tailwind CSS v4, shadcn/ui (new-york, vendored), dark-only theme |
| Server state         | TanStack Query 5                                                 |
| Forms and validation | react-hook-form + Zod 4                                          |
| Storage              | better-sqlite3 + Drizzle ORM                                     |
| Testing              | Vitest + Testing Library; Playwright (Electron) for e2e          |

## Documentation

- [docs/architecture.md](docs/architecture.md) — process model, feature slices, IPC contract, data layer, security model, and the machine-enforced boundaries.
- [docs/development.md](docs/development.md) — setup, day-to-day workflow, testing, database migrations, packaging, and conventions.

## License

[MIT](LICENSE).
