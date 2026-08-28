---
name: db-migration
description: "Trigger: schema change, new table, new column, drizzle, migration, SQLite, db:generate, repository. Change persistence the forward-only way."
license: MIT
metadata:
  author: "Lucho"
  version: "1.0"
---

## Activation Contract

Load when changing `src/main/db/schema.ts`, adding or altering a table or column, writing a SQLite repository, or storing a file path in the database.

## Hard Rules

- Author migrations with `npm run db:generate` after editing `src/main/db/schema.ts`. Never hand-write a migration file.
- Never edit a migration that has been applied. Author a new one.
- There is no `db:migrate` script: the app migrates itself, forward-only at startup (`src/main/db/migrate.ts`), copying the DB aside as `course-companion.db.bak-<n>` first. Do not add a rollback path.
- Migrations stay bundled for packaged builds (`drizzle/migrations/**/*` in `electron-builder.yml`).
- SQLite access lives only in main-side `adapters/`. Never in `domain/`, never in the renderer.
- Persisted file paths are userData-relative. Never write a machine-specific absolute root into a row.
- For attachments the row is the source of truth and the file under `userData/attachments/<subjectId>/` is a copy.
- Multi-table writes that must not half-apply run inside one transaction (see `sqliteSubjectRepository`).

## Decision Gates

| Situation | Action |
| --- | --- |
| New entity owned by a subject | Add the table with the owning FK; no independent lifecycle |
| Read-only view over existing tables | Add a query to the existing repository, no new table |
| Column added to a shipped table | New migration only; keep the column nullable or defaulted |

## Execution Steps

1. Edit `src/main/db/schema.ts`.
2. Run `npm run db:generate` and read the generated SQL before committing it.
3. Update the repository adapter and its colocated test.
4. Update the Zod contract if the shape crosses IPC (`ipc-contract` skill).
5. Run `npm test` and `npm run typecheck`; launch the app once so the migration actually applies.

## Output Contract

Report the schema change, the generated migration filename, the repository and test updates, and confirmation that the migration applied at startup.

## References

- `docs/development.md` — database workflow and rules.
- `docs/architecture.md` — data layer and table inventory.
- `src/main/db/migrate.ts`, `src/main/materias/adapters/`.
