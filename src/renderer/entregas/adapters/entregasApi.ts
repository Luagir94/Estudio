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

export interface EntregasApi {
  create(input: CreateDeadlineInput): Promise<DeadlineWithSubject>
  list(): Promise<DeadlineWithSubject[]>
  update(input: UpdateDeadlineInput): Promise<DeadlineWithSubject>
  setDone(input: SetDeadlineDoneInput): Promise<DeadlineWithSubject>
  delete(id: number): Promise<DeleteDeadlineResult>
}

export const entregasApi: EntregasApi = {
  async create(input) {
    const result = await window.api.entregas.create(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return deadlineWithSubjectSchema.parse(result.data)
  },
  async list() {
    const result = await window.api.entregas.list()
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return listDeadlinesResultSchema.parse(result.data)
  },
  async update(input) {
    const result = await window.api.entregas.update(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return deadlineWithSubjectSchema.parse(result.data)
  },
  async setDone(input) {
    const result = await window.api.entregas.setDone(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return deadlineWithSubjectSchema.parse(result.data)
  },
  async delete(id) {
    const result = await window.api.entregas.delete(id)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return deleteDeadlineResultSchema.parse(result.data)
  }
}
