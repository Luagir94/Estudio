// IPC-backed port implementation (design §4). Crosses the preload bridge via
// `window.api.fechas`, then Zod-parses the response before handing typed data
// to TanStack Query — the renderer side of the two-directional parsing rule
// in design §2.
import {
  academicDateRecordSchema,
  type AcademicDateRecord,
  type AcademicDateWithProgram,
  type CreateAcademicDateInput,
  deleteAcademicDateResultSchema,
  type DeleteAcademicDateResult,
  listAcademicDatesResultSchema,
  type UpdateAcademicDateInput
} from '../../../shared/ipc/fechas'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// The bridge never throws (design §2) — it resolves an `IpcResult` envelope.
// This error preserves the envelope's typed `code` across the throw, unlike a
// plain `Error`: the renderer maps its Spanish copy from the code
// (`shared/lib/ipcErrorCopy.ts`), never from `message`.
export class FechasApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'FechasApiError'
  }
}

export interface FechasApi {
  list(): Promise<AcademicDateWithProgram[]>
  create(input: CreateAcademicDateInput): Promise<AcademicDateRecord>
  update(input: UpdateAcademicDateInput): Promise<AcademicDateRecord>
  delete(id: number): Promise<DeleteAcademicDateResult>
}

export const fechasApi: FechasApi = {
  async list() {
    return unwrapIpcResult(await window.api.fechas.list(), listAcademicDatesResultSchema, FechasApiError)
  },
  async create(input) {
    return unwrapIpcResult(await window.api.fechas.create(input), academicDateRecordSchema, FechasApiError)
  },
  async update(input) {
    return unwrapIpcResult(await window.api.fechas.update(input), academicDateRecordSchema, FechasApiError)
  },
  async delete(id) {
    return unwrapIpcResult(await window.api.fechas.delete(id), deleteAcademicDateResultSchema, FechasApiError)
  }
}
