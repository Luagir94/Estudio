// IPC-backed port implementation (design §4). Crosses the preload bridge via
// `window.api.carreras`, then Zod-parses the response before handing typed
// data to TanStack Query — the renderer side of the two-directional parsing
// rule in design §2.
import {
  type CreatePeriodInput,
  type CreateProgramInput,
  deletePeriodResultSchema,
  type DeletePeriodResult,
  deleteProgramResultSchema,
  type DeleteProgramResult,
  listProgramsResultSchema,
  periodRecordSchema,
  type PeriodRecord,
  programRecordSchema,
  type ProgramRecord,
  programWithPeriodsSchema,
  type ProgramWithPeriods,
  type UpdatePeriodInput,
  type UpdateProgramInput
} from '../../../shared/ipc/carreras'

export interface CarrerasApi {
  create(input: CreateProgramInput): Promise<ProgramRecord>
  list(): Promise<ProgramWithPeriods[]>
  detail(id: number): Promise<ProgramWithPeriods>
  update(input: UpdateProgramInput): Promise<ProgramRecord>
  createPeriod(input: CreatePeriodInput): Promise<PeriodRecord>
  updatePeriod(input: UpdatePeriodInput): Promise<PeriodRecord>
  deletePeriod(id: number): Promise<DeletePeriodResult>
  delete(id: number): Promise<DeleteProgramResult>
}

export const carrerasApi: CarrerasApi = {
  async create(input) {
    const result = await window.api.carreras.create(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return programRecordSchema.parse(result.data)
  },
  async list() {
    const result = await window.api.carreras.list()
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return listProgramsResultSchema.parse(result.data)
  },
  async detail(id) {
    const result = await window.api.carreras.detail(id)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return programWithPeriodsSchema.parse(result.data)
  },
  async update(input) {
    const result = await window.api.carreras.update(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return programRecordSchema.parse(result.data)
  },
  async createPeriod(input) {
    const result = await window.api.carreras.createPeriod(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return periodRecordSchema.parse(result.data)
  },
  async updatePeriod(input) {
    const result = await window.api.carreras.updatePeriod(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return periodRecordSchema.parse(result.data)
  },
  async deletePeriod(id) {
    const result = await window.api.carreras.deletePeriod(id)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return deletePeriodResultSchema.parse(result.data)
  },
  async delete(id) {
    const result = await window.api.carreras.delete(id)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return deleteProgramResultSchema.parse(result.data)
  }
}
