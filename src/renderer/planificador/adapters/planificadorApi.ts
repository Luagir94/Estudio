// IPC-backed port implementation (design §4). Crosses the preload bridge via
// `window.api.planificador`, then Zod-parses the response before handing typed
// data to TanStack Query.
//
// The one read here is the DRAFT. Correlativas have no read of their own on
// purpose: they arrive on the subject payloads (`materiasApi.list` as edges,
// `materiasApi.detail` as full records), the same way final-exam, parcial and
// class rows do — this adapter owns their WRITES only.
import { subjectPrerequisiteSchema, type SubjectPrerequisite } from '../../../shared/ipc/materias'
import {
  type AddPrerequisiteInput,
  type DeletePrerequisiteResult,
  deletePrerequisiteResultSchema,
  listPlannerEntriesResultSchema,
  type PlannerEntryInput,
  type PlannerEntryRecord,
  plannerEntryRecordSchema,
  plannerEntryRemovedSchema,
  type UpdatePrerequisiteInput
} from '../../../shared/ipc/planificador'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// Preserves the envelope's typed `code` across the throw (base class doc) —
// the renderer maps its Spanish copy from the code
// (`shared/lib/ipcErrorCopy.ts`), never from `message`. The `message` still
// carries the STABLE MACHINE KEY (`prerequisite.cycle`,
// `prerequisite.selfReference`), which is what lets a caller tell one refusal
// of `addPrerequisite` from another.
export class PlanificadorApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'PlanificadorApiError'
  }
}

export interface PlanificadorApi {
  list(): Promise<PlannerEntryRecord[]>
  addPrerequisite(input: AddPrerequisiteInput): Promise<SubjectPrerequisite>
  updatePrerequisite(input: UpdatePrerequisiteInput): Promise<SubjectPrerequisite>
  removePrerequisite(id: number): Promise<DeletePrerequisiteResult>
  addEntry(input: PlannerEntryInput): Promise<PlannerEntryRecord>
  removeEntry(input: PlannerEntryInput): Promise<PlannerEntryInput>
}

export const planificadorApi: PlanificadorApi = {
  async list() {
    return unwrapIpcResult(await window.api.planificador.list(), listPlannerEntriesResultSchema, PlanificadorApiError)
  },
  async addPrerequisite(input) {
    return unwrapIpcResult(
      await window.api.planificador.addPrerequisite(input),
      subjectPrerequisiteSchema,
      PlanificadorApiError
    )
  },
  async updatePrerequisite(input) {
    return unwrapIpcResult(
      await window.api.planificador.updatePrerequisite(input),
      subjectPrerequisiteSchema,
      PlanificadorApiError
    )
  },
  async removePrerequisite(id) {
    return unwrapIpcResult(
      await window.api.planificador.removePrerequisite(id),
      deletePrerequisiteResultSchema,
      PlanificadorApiError
    )
  },
  async addEntry(input) {
    return unwrapIpcResult(
      await window.api.planificador.addEntry(input),
      plannerEntryRecordSchema,
      PlanificadorApiError
    )
  },
  async removeEntry(input) {
    return unwrapIpcResult(
      await window.api.planificador.removeEntry(input),
      plannerEntryRemovedSchema,
      PlanificadorApiError
    )
  }
}
