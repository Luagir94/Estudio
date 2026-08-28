---
name: project-conventions
description: "Trigger: naming, formatting, prettier, UI copy, Spanish text, i18n namespace, theme, .pen design file, comments. Apply Course Companion conventions."
license: MIT
metadata:
  author: "Lucho"
  version: "1.0"
---

## Activation Contract

Load before writing any source file, UI string, comment, or style in this repo, and before touching the design file.

## Hard Rules

- Prettier owns formatting: no semicolons, single quotes, no trailing commas, 120-column width, LF endings. Run `npm run format`; never hand-format around it.
- Identifiers use the Spanish domain term (materias, entregas, hoy, adjuntos, ajustes, carreras, finales, horario, parciales, planificador). Comments and infrastructure naming are English.
- UI copy is Spanish and lives in i18next namespaces: `src/renderer/locales/es/<slice>.json`, read with `useTranslation('<slice>')`. Never hardcode user-facing strings in a component.
- Validation messages are machine keys resolved through `translateValidationMessage` / `zodErrorMap`, not prose in the schema.
- Dark is the default theme; light follows the OS through the `prefers-color-scheme` query in `src/renderer/shared/styles/globals.css`. Style with semantic tokens and Tailwind utilities, not raw hex values. Per-subject colours go through `src/renderer/shared/lib/subjectColorScheme.ts`.
- UI primitives are the vendored shadcn/ui components in `src/renderer/shared/components`. Extend them there rather than pulling a new UI dependency.
- `design/course-companion` is an encrypted Pencil `.pen` file and the visual source of truth. Never hand-edit, `cat`, or diff it; use Pencil tooling.
- Node >= 22.18, TypeScript 7 native compiler. The pinned classic `typescript@6.0.3` in `overrides` exists only for the lint toolchain; do not use it to justify `tsc` behaviour.

## Decision Gates

| Adding | Put it in |
| --- | --- |
| A user-visible string | `src/renderer/locales/es/<slice>.json` |
| A cross-slice helper | `src/renderer/shared/lib/` |
| A visual change | The `.pen` design file first, then code after approval |
| A new npm dependency | Justify it against the vendored/shared option first |

## Execution Steps

1. Match the surrounding file's idiom before inventing one.
2. Add copy to the slice namespace and reference it by key.
3. Run `npm run format` and `npm run lint`.

## Output Contract

Report copy keys added, any new shared helper, and the `format` plus `lint` results.

## References

- `docs/development.md` — conventions, linting, packaging.
- `src/renderer/i18n/index.ts`, `.prettierrc.json`, `eslint.config.mjs`.
