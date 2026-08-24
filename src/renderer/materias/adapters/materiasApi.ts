// IPC-backed port implementation (design §4). Crosses the preload bridge
// via `window.api.materias`, then Zod-parses the response before handing
// typed data to TanStack Query — the renderer side of the two-directional
// parsing rule in design §2 ("renderer parses responses before caching").
import {
  type CreateSubjectInput,
  deleteSubjectResultSchema,
  type DeleteSubjectResult,
  listSubjectsResultSchema,
  type SetSubjectOutcomeInput,
  subjectDetailSchema,
  type SubjectDetailResult,
  subjectWithSlotsSchema,
  subjectWithStatusSchema,
  type SubjectWithSlots,
  type SubjectWithStatus,
  type UpdateSubjectScheduleInput
} from '../../../shared/ipc/materias'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// Preserves the envelope's typed `code` across the throw (base class doc) —
// the renderer maps its Spanish copy from the code
// (`shared/lib/ipcErrorCopy.ts`), never from `message`.
export class MateriasApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'MateriasApiError'
  }
}

export interface MateriasApi {
  create(input: CreateSubjectInput): Promise<SubjectWithSlots>
  list(): Promise<SubjectWithStatus[]>
  detail(id: number): Promise<SubjectDetailResult>
  updateSchedule(input: UpdateSubjectScheduleInput): Promise<SubjectWithSlots>
  delete(id: number): Promise<DeleteSubjectResult>
  setOutcome(input: SetSubjectOutcomeInput): Promise<SubjectWithStatus>
}

export const materiasApi: MateriasApi = {
  async create(input) {
    return unwrapIpcResult(await window.api.materias.create(input), subjectWithSlotsSchema, MateriasApiError)
  },
  async list() {
    return unwrapIpcResult(await window.api.materias.list(), listSubjectsResultSchema, MateriasApiError)
  },
  async detail(id) {
    return unwrapIpcResult(await window.api.materias.detail(id), subjectDetailSchema, MateriasApiError)
  },
  async updateSchedule(input) {
    return unwrapIpcResult(await window.api.materias.updateSchedule(input), subjectWithSlotsSchema, MateriasApiError)
  },
  async delete(id) {
    return unwrapIpcResult(await window.api.materias.delete(id), deleteSubjectResultSchema, MateriasApiError)
  },
  async setOutcome(input) {
    return unwrapIpcResult(await window.api.materias.setOutcome(input), subjectWithStatusSchema, MateriasApiError)
  }
}
