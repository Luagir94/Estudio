---
name: feature-slice
description: "Trigger: new feature slice, new domain, new screen, extend a slice, where does this file go. Build vertical slices with hexagonal layers."
license: MIT
metadata:
  author: "Lucho"
  version: "1.0"
---

## Activation Contract

Load when adding or extending a vertical feature slice (`src/main/<slice>/`, `src/renderer/<slice>/`), when a change spans both processes, or when deciding which layer a new file belongs to.

## Hard Rules

- A slice exists on both sides of the IPC boundary with the same layers: main `domain/ adapters/ ipc/ <slice>Service.ts`; renderer `domain/ adapters/ containers/ components/`.
- `domain/` is framework-free. Renderer `domain/` must not import `electron` or `better-sqlite3`, not even as types.
- Containers own fetching and state (TanStack Query); components take props and render. No fetching or `window.api` calls inside `components/`.
- Adapters and handlers are constructed only in `bootstrap()` (`src/main/index.ts`). Routes are declared only in `src/renderer/router.tsx`.
- Reuse an existing repository when the slice is a read-only projection over data another slice owns (`horario:week` reads the `materias` repository).
- Slice and identifier names use the Spanish domain term; comments and infrastructure naming stay English.

## Decision Gates

| Situation | Action |
| --- | --- |
| Orchestration across repositories or subprocesses | Add `<slice>Service.ts`; otherwise the handler calls the repository directly |
| New screen | Flat route in `router.tsx`; parse every `$id` with `parseRouteId` |
| New renderer to main call | Follow the `ipc-contract` skill |
| Persistence change | Follow the `db-migration` skill |

## Execution Steps

1. Define the Zod contract in `src/shared/ipc/<slice>.ts`.
2. Write main `domain/`, `adapters/<slice>Repository.ts`, `ipc/register<Slice>Handlers.ts`.
3. Wire the repository and handlers in `bootstrap()`.
4. Add the typed group to `api` in `src/preload/index.ts` using **type-only** imports.
5. Write renderer `domain/`, `adapters/` (calls `window.api`, Zod-parses), `containers/`, `components/`.
6. Add the copy namespace `src/renderer/locales/es/<slice>.json` and register it in `src/renderer/i18n/index.ts`.
7. Colocate a test at every layer, then run `npm test` and `npm run typecheck`.

## Output Contract

Report the files added per layer, the `bootstrap()` and preload wiring, the i18n namespace, and the results of `npm test` and `npm run typecheck`.

## References

- `docs/architecture.md` — feature slices, hexagonal layers, composition root, navigation.
- `docs/development.md` — checklist for a new feature slice.
- `src/main/entregas/`, `src/renderer/entregas/` — reference slice.
