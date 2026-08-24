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
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// The bridge never throws (design §2) — it resolves an `IpcResult` envelope.
// This error preserves the envelope's typed `code` across the throw, unlike
// a plain `Error`, exactly like `AdjuntosApiError`/`AjustesApiError`: the
// renderer maps its Spanish copy from the code (`shared/lib/ipcErrorCopy.ts`),
// never from `message`.
export class CarrerasApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'CarrerasApiError'
  }
}

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
    return unwrapIpcResult(await window.api.carreras.create(input), programRecordSchema, CarrerasApiError)
  },
  async list() {
    return unwrapIpcResult(await window.api.carreras.list(), listProgramsResultSchema, CarrerasApiError)
  },
  async detail(id) {
    return unwrapIpcResult(await window.api.carreras.detail(id), programWithPeriodsSchema, CarrerasApiError)
  },
  async update(input) {
    return unwrapIpcResult(await window.api.carreras.update(input), programRecordSchema, CarrerasApiError)
  },
  async createPeriod(input) {
    return unwrapIpcResult(await window.api.carreras.createPeriod(input), periodRecordSchema, CarrerasApiError)
  },
  async updatePeriod(input) {
    return unwrapIpcResult(await window.api.carreras.updatePeriod(input), periodRecordSchema, CarrerasApiError)
  },
  async deletePeriod(id) {
    return unwrapIpcResult(await window.api.carreras.deletePeriod(id), deletePeriodResultSchema, CarrerasApiError)
  },
  async delete(id) {
    return unwrapIpcResult(await window.api.carreras.delete(id), deleteProgramResultSchema, CarrerasApiError)
  }
}
