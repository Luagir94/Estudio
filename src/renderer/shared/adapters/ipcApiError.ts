// The one place the renderer unwraps an `IpcResult` envelope (design §2 —
// the bridge never throws, it resolves `{ ok: true, data } | { ok: false,
// error }`). Every feature adapter used to repeat the same four lines, and
// the ones that reached for a plain `new Error(message)` silently DROPPED
// the envelope's `code` — the only part of an IPC failure the app may show
// (`shared/lib/ipcErrorCopy.ts` maps Spanish copy from the code, never from
// `message`).
import type { IpcResult } from '../../../shared/ipc/materias'

/**
 * Base class for every feature adapter's `XxxApiError`: preserves the
 * envelope's typed `code` across the throw, unlike a plain `Error`, so
 * `describeIpcError` can classify it. Feature classes extend it only to
 * keep their own `instanceof` identity (`AdjuntosApiError` drives the
 * "Archivo no encontrado" row state, for example) — the shape is the same.
 */
export class IpcApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'IpcApiError'
    this.code = code
  }
}

/** Constructor shape every feature `XxxApiError` shares. */
export type IpcApiErrorConstructor = new (code: string, message: string) => IpcApiError

/**
 * Unwraps an `IpcResult`: throws the feature's error class (carrying the
 * envelope `code`) on failure, Zod-parses and returns the data on success —
 * the renderer side of the two-directional parsing rule in design §2. A
 * malformed SUCCESS payload still fails as the schema's own error (an app
 * bug), never dressed up as an ApiError (a reportable IPC outcome).
 */
export function unwrapIpcResult<T>(
  result: IpcResult<unknown>,
  schema: { parse: (data: unknown) => T },
  ApiError: IpcApiErrorConstructor
): T {
  if (!result.ok) {
    throw new ApiError(result.error.code, result.error.message)
  }
  return schema.parse(result.data)
}

/**
 * Same failure contract as `unwrapIpcResult` for the handful of channels
 * whose success carries no payload (`app:openExternal`, `cli:disconnect`,
 * `adjuntos:open`).
 */
export function assertIpcOk(result: IpcResult<unknown>, ApiError: IpcApiErrorConstructor): void {
  if (!result.ok) {
    throw new ApiError(result.error.code, result.error.message)
  }
}
