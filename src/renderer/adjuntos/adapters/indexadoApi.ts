// IPC-backed port implementation (attachment-fts-index design "Renderer
// Delta") for the `indexado:*` channels. Crosses the preload bridge via
// `window.api.indexado` — same two-directional parsing rule and adapter
// shape as `adjuntosApi.ts` / `appApi.ts`.
import { type IndexStatusChangedPayload, type SyncResult, syncResultSchema } from '../../../shared/ipc/indexado'

export interface IndexadoApi {
  sync(): Promise<SyncResult>
  /** Subscribes to the background indexing push event. Returns an unsubscribe function. */
  onStatusChanged(callback: (payload: IndexStatusChangedPayload) => void): () => void
}

export const indexadoApi: IndexadoApi = {
  async sync() {
    const result = await window.api.indexado.sync()
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return syncResultSchema.parse(result.data)
  },
  onStatusChanged(callback) {
    return window.api.indexado.onStatusChanged(callback)
  }
}
