// IPC-backed port implementation (design §4). Crosses the preload bridge via
// `window.api.parciales`, then Zod-parses the response before handing typed
// data to TanStack Query.
//
// There is no `list` here: parciales arrive on the subject detail payload
// (`materiasApi.detail`), the same way final-exam records do — this adapter
// owns writes only.
import {
  type CreatePartialExamInput,
  deletePartialExamResultSchema,
  type DeletePartialExamResult,
  type UpdatePartialExamInput
} from '../../../shared/ipc/parciales'
import { partialExamRecordSchema, type PartialExamRecord } from '../../../shared/ipc/materias'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// Preserves the envelope's typed `code` across the throw (base class doc) —
// the renderer maps its Spanish copy from the code
// (`shared/lib/ipcErrorCopy.ts`), never from `message`.
export class ParcialesApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'ParcialesApiError'
  }
}

export interface ParcialesApi {
  create(input: CreatePartialExamInput): Promise<PartialExamRecord>
  update(input: UpdatePartialExamInput): Promise<PartialExamRecord>
  delete(id: number): Promise<DeletePartialExamResult>
}

export const parcialesApi: ParcialesApi = {
  async create(input) {
    return unwrapIpcResult(await window.api.parciales.create(input), partialExamRecordSchema, ParcialesApiError)
  },
  async update(input) {
    return unwrapIpcResult(await window.api.parciales.update(input), partialExamRecordSchema, ParcialesApiError)
  },
  async delete(id) {
    return unwrapIpcResult(await window.api.parciales.delete(id), deletePartialExamResultSchema, ParcialesApiError)
  }
}
