// IPC-backed port implementation (design §4) for the cross-cutting `app:*`
// channels. Crosses the preload bridge via `window.api.app`.
import { type ExportJsonResult, exportJsonResultSchema } from '../../../shared/ipc/app'

export interface AppApi {
  openExternal(url: string): Promise<void>
  exportJson(): Promise<ExportJsonResult>
  /** Subscribes to the native File menu's push event. Returns an unsubscribe function. */
  onExportRequested(callback: () => void): () => void
}

export const appApi: AppApi = {
  async openExternal(url) {
    const result = await window.api.app.openExternal({ url })
    if (!result.ok) {
      throw new Error(result.error.message)
    }
  },
  async exportJson() {
    const result = await window.api.app.exportJson()
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return exportJsonResultSchema.parse(result.data)
  },
  onExportRequested(callback) {
    return window.api.app.onExportRequested(callback)
  }
}
