// IPC-backed port implementation (design §4). Crosses the preload bridge
// via `window.api.hoy`, then Zod-parses the response before handing typed
// data to TanStack Query — the renderer side of the two-directional parsing
// rule in design §2 ("renderer parses responses before caching").
import { type DashboardResult, dashboardResultSchema } from '../../../shared/ipc/hoy'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// Preserves the envelope's typed `code` across the throw (base class doc) —
// the renderer maps its Spanish copy from the code
// (`shared/lib/ipcErrorCopy.ts`), never from `message`.
export class HoyApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'HoyApiError'
  }
}

export interface HoyApi {
  dashboard(): Promise<DashboardResult>
}

export const hoyApi: HoyApi = {
  async dashboard() {
    return unwrapIpcResult(await window.api.hoy.dashboard(), dashboardResultSchema, HoyApiError)
  }
}
