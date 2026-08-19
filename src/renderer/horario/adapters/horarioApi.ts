// IPC-backed port implementation (design §4). Crosses the preload bridge
// via `window.api.horario`, then Zod-parses the response before handing
// typed data to TanStack Query — the renderer side of the two-directional
// parsing rule in design §2 ("renderer parses responses before caching").
import { type WeekScheduleResult, weekScheduleResultSchema } from '../../../shared/ipc/horario'

export interface HorarioApi {
  week(): Promise<WeekScheduleResult>
}

export const horarioApi: HorarioApi = {
  async week() {
    const result = await window.api.horario.week()
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return weekScheduleResultSchema.parse(result.data)
  }
}
