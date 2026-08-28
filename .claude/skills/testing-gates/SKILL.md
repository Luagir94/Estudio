---
name: testing-gates
description: "Trigger: write tests, vitest, jsdom, Testing Library, playwright e2e, npm test, is this done. Apply the project's test placement and green-gate rules."
license: MIT
metadata:
  author: "Lucho"
  version: "1.0"
---

## Activation Contract

Load when writing or moving a test, choosing a test environment, or deciding whether a change is finished.

## Hard Rules

- Tests are colocated: `foo.test.ts` sits next to `foo.ts`; `foo.test.tsx` next to `foo.tsx`. Tooling tests live in `tooling/`.
- The default Vitest environment is `node`. Component and container tests opt in with `// @vitest-environment jsdom` as the **first line** of the file.
- React tests use Testing Library queries and user-event against rendered output. Do not assert on internal state or implementation details.
- i18next is initialized synchronously in `vitest.setup.ts`, so component tests assert the real Spanish copy with no per-test setup.
- `npm test` runs `format:check` + `test:unit` + `lint:deps` + `lint`. It does **not** run typecheck or e2e.
- A change is not done until `npm test` and `npm run typecheck` both pass.
- Never weaken the dependency-guard tests or their minimum-module threshold to make a suite pass.
- Every layer of a slice gets a test: domain, adapter, ipc handler, container, component.

## Decision Gates

| Change touches | Also run |
| --- | --- |
| Production wiring, preload, IPC surface, startup | `npm run test:e2e` |
| Only pure domain logic | `npm run test:unit` while iterating |
| `tooling/dependencyGuard.mts` | `npm run lint:deps` plus its fixture tests |

## Execution Steps

1. Place the test next to its subject and add the jsdom docblock if it renders React.
2. Write the failing test first, then the implementation.
3. Run `npm run test:unit` while iterating.
4. Before reporting done, run `npm test` and `npm run typecheck`; add `npm run test:e2e` when the gate table calls for it.
5. Report failures with their real output. Never claim a gate passed without running it.

## Output Contract

Report each test file added, the environment it runs in, and the exact commands run with their results.

## References

- `docs/development.md` — testing, e2e specs, what `npm test` covers.
- `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `e2e/`.
