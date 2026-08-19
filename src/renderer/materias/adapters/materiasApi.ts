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
    const result = await window.api.materias.create(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return subjectWithSlotsSchema.parse(result.data)
  },
  async list() {
    const result = await window.api.materias.list()
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return listSubjectsResultSchema.parse(result.data)
  },
  async detail(id) {
    const result = await window.api.materias.detail(id)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return subjectDetailSchema.parse(result.data)
  },
  async updateSchedule(input) {
    const result = await window.api.materias.updateSchedule(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return subjectWithSlotsSchema.parse(result.data)
  },
  async delete(id) {
    const result = await window.api.materias.delete(id)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return deleteSubjectResultSchema.parse(result.data)
  },
  async setOutcome(input) {
    const result = await window.api.materias.setOutcome(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return subjectWithStatusSchema.parse(result.data)
  }
}
