---
name: ipc-contract
description: "Trigger: IPC channel, window.api, preload bridge, Zod contract, ipcOk/ipcErr, renderer-main call. Define and validate IPC contracts on both sides."
license: MIT
metadata:
  author: "Lucho"
  version: "1.0"
---

## Activation Contract

Load when adding or changing anything that crosses renderer to main: a channel, a payload or response shape, a preload forwarder, or a renderer adapter.

## Hard Rules

- One contract module per domain: `src/shared/ipc/<domain>.ts`. Zod only, framework-free.
- Parse on BOTH sides. Main parses the payload with `parsePayload(schema, payload)` before executing; the renderer adapter Zod-parses the response before it reaches TanStack Query.
- Every handler returns `IpcResult<T>` through `ipcOk` / `ipcErr`. Nothing throws across the bridge.
- Preload only forwards, never parses. It imports **types** from `shared/ipc/*` plus runtime constants from `shared/ipc/channels.ts`; a runtime import of any Zod-using module breaks the sandboxed preload bundle.
- `src/shared/ipc/channels.ts` stays dependency-free. Any channel name preload needs at runtime is declared there.
- Zod messages are stable machine keys (`title.required`), never user prose. Spanish copy is resolved in the renderer from the error `code` via `src/renderer/shared/lib/ipcErrorCopy.ts`.
- Bound every persisted free-text field with `.max(...)`.

## Decision Gates

| Need | Where |
| --- | --- |
| Request/response shape | `src/shared/ipc/<domain>.ts` |
| Channel name preload needs at runtime, or a push event | `src/shared/ipc/channels.ts` |
| Envelope helpers | Re-export `ipcOk`, `ipcErr`, `IpcResult`, `parsePayload` from `./materias` |
| Renderer-side unwrapping | `unwrapIpcResult` + an `IpcApiError` subclass in the slice adapter |

## Execution Steps

1. Add input/output schemas and inferred types to the contract module.
2. Register `ipcMain.handle('<domain>:<verb>', ...)`: parse, execute, return `ipcOk`/`ipcErr`, `log.error` on failure.
3. Add the typed forwarder group to `src/preload/index.ts`.
4. In the renderer adapter call `window.api.<domain>.<verb>`, unwrap the envelope, Zod-parse the data.
5. Test the contract, the handler, and the adapter.

## Output Contract

Report the channel names, the schemas added, both parse sites, the preload group, and any new error code plus its Spanish copy entry.

## References

- `docs/architecture.md` — IPC contract and a `materias:create` call traced end to end.
- `src/shared/ipc/entregas.ts`, `src/main/entregas/ipc/registerEntregasHandlers.ts`, `src/renderer/entregas/adapters/entregasApi.ts`.
