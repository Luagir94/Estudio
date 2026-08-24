// IPC-backed port implementation (attachment-fts-index design "Renderer
// Delta") for the `indexado:*` channels. Crosses the preload bridge via
// `window.api.indexado` — same two-directional parsing rule and adapter
// shape as `adjuntosApi.ts` / `appApi.ts`.
import { type IndexStatusChangedPayload, type SyncResult, syncResultSchema } from '../../../shared/ipc/indexado'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// Preserves the envelope's typed `code` across the throw (base class doc) —
// the renderer maps its Spanish copy from the code
// (`shared/lib/ipcErrorCopy.ts`), never from `message`.
export class IndexadoApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'IndexadoApiError'
  }
}

export interface IndexadoApi {
  sync(): Promise<SyncResult>
  /** Subscribes to the background indexing push event. Returns an unsubscribe function. */
  onStatusChanged(callback: (payload: IndexStatusChangedPayload) => void): () => void
}

export const indexadoApi: IndexadoApi = {
  async sync() {
    return unwrapIpcResult(await window.api.indexado.sync(), syncResultSchema, IndexadoApiError)
  },
  onStatusChanged(callback) {
    return window.api.indexado.onStatusChanged(callback)
  }
}
