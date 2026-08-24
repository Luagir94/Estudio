// IPC-backed port implementation (design §4). Crosses the preload bridge
// via `window.api.horario`, then Zod-parses the response before handing
// typed data to TanStack Query — the renderer side of the two-directional
// parsing rule in design §2 ("renderer parses responses before caching").
import { type WeekScheduleResult, weekScheduleResultSchema } from '../../../shared/ipc/horario'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// Preserves the envelope's typed `code` across the throw (base class doc) —
// the renderer maps its Spanish copy from the code
// (`shared/lib/ipcErrorCopy.ts`), never from `message`.
export class HorarioApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'HorarioApiError'
  }
}

export interface HorarioApi {
  week(): Promise<WeekScheduleResult>
}

export const horarioApi: HorarioApi = {
  async week() {
    return unwrapIpcResult(await window.api.horario.week(), weekScheduleResultSchema, HorarioApiError)
  }
}
