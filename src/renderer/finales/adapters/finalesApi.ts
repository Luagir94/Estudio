// IPC-backed port implementation (design §4). Crosses the preload bridge via
// `window.api.finales`, then Zod-parses the response before handing typed
// data to TanStack Query.
import {
  type CreateFinalExamInput,
  deleteFinalExamResultSchema,
  type DeleteFinalExamResult,
  type UpdateFinalExamInput
} from '../../../shared/ipc/finales'
import { finalExamRecordSchema, type FinalExamRecord } from '../../../shared/ipc/materias'

export interface FinalesApi {
  create(input: CreateFinalExamInput): Promise<FinalExamRecord>
  update(input: UpdateFinalExamInput): Promise<FinalExamRecord>
  delete(id: number): Promise<DeleteFinalExamResult>
}

export const finalesApi: FinalesApi = {
  async create(input) {
    const result = await window.api.finales.create(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return finalExamRecordSchema.parse(result.data)
  },
  async update(input) {
    const result = await window.api.finales.update(input)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return finalExamRecordSchema.parse(result.data)
  },
  async delete(id) {
    const result = await window.api.finales.delete(id)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return deleteFinalExamResultSchema.parse(result.data)
  }
}
