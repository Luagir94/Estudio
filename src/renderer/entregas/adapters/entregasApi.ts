// IPC-backed port implementation (design §4). Crosses the preload bridge
// via `window.api.entregas`, then Zod-parses the response before handing
// typed data to TanStack Query — the renderer side of the two-directional
// parsing rule in design §2 ("renderer parses responses before caching").
import {
  type CreateDeadlineInput,
  deadlineWithSubjectSchema,
  type DeadlineWithSubject,
  deleteDeadlineResultSchema,
  type DeleteDeadlineResult,
  listDeadlinesResultSchema,
  type SetDeadlineDoneInput,
  type UpdateDeadlineInput
} from '../../../shared/ipc/entregas'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// Preserves the envelope's typed `code` across the throw (base class doc) —
// the renderer maps its Spanish copy from the code
// (`shared/lib/ipcErrorCopy.ts`), never from `message`.
export class EntregasApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'EntregasApiError'
  }
}

export interface EntregasApi {
  create(input: CreateDeadlineInput): Promise<DeadlineWithSubject>
  list(): Promise<DeadlineWithSubject[]>
  update(input: UpdateDeadlineInput): Promise<DeadlineWithSubject>
  setDone(input: SetDeadlineDoneInput): Promise<DeadlineWithSubject>
  delete(id: number): Promise<DeleteDeadlineResult>
}

export const entregasApi: EntregasApi = {
  async create(input) {
    return unwrapIpcResult(await window.api.entregas.create(input), deadlineWithSubjectSchema, EntregasApiError)
  },
  async list() {
    return unwrapIpcResult(await window.api.entregas.list(), listDeadlinesResultSchema, EntregasApiError)
  },
  async update(input) {
    return unwrapIpcResult(await window.api.entregas.update(input), deadlineWithSubjectSchema, EntregasApiError)
  },
  async setDone(input) {
    return unwrapIpcResult(await window.api.entregas.setDone(input), deadlineWithSubjectSchema, EntregasApiError)
  },
  async delete(id) {
    return unwrapIpcResult(await window.api.entregas.delete(id), deleteDeadlineResultSchema, EntregasApiError)
  }
}
