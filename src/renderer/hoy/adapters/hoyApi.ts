// IPC-backed port implementation (design §4). Crosses the preload bridge
// via `window.api.hoy`, then Zod-parses the response before handing typed
// data to TanStack Query — the renderer side of the two-directional parsing
// rule in design §2 ("renderer parses responses before caching").
import { type DashboardResult, dashboardResultSchema } from '../../../shared/ipc/hoy'

export interface HoyApi {
  dashboard(): Promise<DashboardResult>
}

export const hoyApi: HoyApi = {
  async dashboard() {
    const result = await window.api.hoy.dashboard()
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return dashboardResultSchema.parse(result.data)
  }
}
