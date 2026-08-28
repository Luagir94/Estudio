---
name: architecture-boundaries
description: "Trigger: dependency guard, lint:deps, child_process, spawn, CLI subprocess, CSP, fuses, sandbox, domain import. Keep the enforced boundaries intact."
license: MIT
metadata:
  author: "Lucho"
  version: "1.0"
---

## Activation Contract

Load when adding an import to a `domain/` module, spawning or configuring a subprocess, touching window or CSP setup, or changing `tooling/dependencyGuard.mts`.

## Hard Rules

- Renderer `domain/` modules may not import `electron` or `better-sqlite3`. This rule has **no** type-only exemption: naming an Electron type already couples the module to the framework.
- No module under `src/` except `src/main/claude/claudeExecutableValidator.ts` may import `child_process` or `node:child_process`. Type-only imports are exempt for this rule alone.
- Every CLI launch passes the validator's pre-spawn validation. User text travels over **stdin, never argv**. Model ids must match the construct-time character allowlist before reaching a command line.
- Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, the deny-all `setWindowOpenHandler`, and the `will-navigate` origin/pathname pin in `src/main/window.ts`.
- Do not relax the production CSP. The dev-only relaxation exists solely for the Vite React Refresh preamble.
- Do not weaken, skip, or narrow the guard to make a change pass. If a rule genuinely changes, update `tooling/dependencyGuard.mts`, its committed violation fixtures, and `tooling/dependencyGuard.test.ts` together, keeping the minimum-module threshold.
- Electron Fuses in `electron-builder.yml` stay flipped: `runAsNode` off, `NODE_OPTIONS` and inspect args off, cookie encryption on, ASAR integrity and `onlyLoadAppFromAsar` on.

## Decision Gates

| Need | Do |
| --- | --- |
| Domain logic needs a DB row | Take it as a plain argument from an adapter; do not import the driver |
| A new external process | Route it through `claudeExecutableValidator`; do not add a second spawn site |
| Renderer needs a native capability | Add an IPC channel (`ipc-contract` skill) |
| Guard reports a violation | Fix the import, never the guard |

## Execution Steps

1. Place the import in the layer allowed to hold it.
2. Run `npm run lint:deps`.
3. If the guard itself changed, run its fixture tests and the `lint:deps` CLI assertion.
4. Run `npm test`.

## Output Contract

Report which boundary the change touched, why it stays inside the rules, and the `npm run lint:deps` result.

## References

- `docs/architecture.md` — enforced boundaries and security model.
- `tooling/dependencyGuard.mts`, `tooling/dependencyGuard.test.ts`, `src/main/window.ts`.
