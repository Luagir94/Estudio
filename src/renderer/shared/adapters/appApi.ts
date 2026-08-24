// IPC-backed port implementation (design §4) for the cross-cutting `app:*`
// channels. Crosses the preload bridge via `window.api.app`.
import { type ExportJsonResult, exportJsonResultSchema } from '../../../shared/ipc/app'
import { assertIpcOk, IpcApiError, unwrapIpcResult } from './ipcApiError'

// Preserves the envelope's typed `code` across the throw (base class doc) —
// the renderer maps its Spanish copy from the code
// (`shared/lib/ipcErrorCopy.ts`), never from `message`.
export class AppApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'AppApiError'
  }
}

export interface AppApi {
  openExternal(url: string): Promise<void>
  exportJson(): Promise<ExportJsonResult>
  /** Subscribes to the native File menu's push event. Returns an unsubscribe function. */
  onExportRequested(callback: () => void): () => void
}

export const appApi: AppApi = {
  async openExternal(url) {
    assertIpcOk(await window.api.app.openExternal({ url }), AppApiError)
  },
  async exportJson() {
    return unwrapIpcResult(await window.api.app.exportJson(), exportJsonResultSchema, AppApiError)
  },
  onExportRequested(callback) {
    return window.api.app.onExportRequested(callback)
  }
}
