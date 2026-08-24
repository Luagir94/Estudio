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
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// Preserves the envelope's typed `code` across the throw (base class doc) —
// the renderer maps its Spanish copy from the code
// (`shared/lib/ipcErrorCopy.ts`), never from `message`.
export class FinalesApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'FinalesApiError'
  }
}

export interface FinalesApi {
  create(input: CreateFinalExamInput): Promise<FinalExamRecord>
  update(input: UpdateFinalExamInput): Promise<FinalExamRecord>
  delete(id: number): Promise<DeleteFinalExamResult>
}

export const finalesApi: FinalesApi = {
  async create(input) {
    return unwrapIpcResult(await window.api.finales.create(input), finalExamRecordSchema, FinalesApiError)
  },
  async update(input) {
    return unwrapIpcResult(await window.api.finales.update(input), finalExamRecordSchema, FinalesApiError)
  },
  async delete(id) {
    return unwrapIpcResult(await window.api.finales.delete(id), deleteFinalExamResultSchema, FinalesApiError)
  }
}
