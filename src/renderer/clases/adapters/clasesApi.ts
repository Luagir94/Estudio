// IPC-backed port implementation (design §4). Crosses the preload bridge via
// `window.api.clases`, then Zod-parses the response before handing typed data
// to TanStack Query.
//
// There is no `list` here: marks and apuntes arrive on the subject detail
// payload (`materiasApi.detail`) and on the dashboard payload
// (`hoyApi.dashboard`), the same way final-exam and parcial records do — this
// adapter owns WRITES only.
import {
  classDayResultSchema,
  saveClassNoteResultSchema,
  type ClassDayInput,
  type ClassDayResult,
  type SaveClassNoteInput,
  type SaveClassNoteResult,
  type SetAttendanceInput
} from '../../../shared/ipc/clases'
import { attendanceRecordSchema, type AttendanceRecord } from '../../../shared/ipc/materias'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// Preserves the envelope's typed `code` across the throw (base class doc) —
// the renderer maps its Spanish copy from the code
// (`shared/lib/ipcErrorCopy.ts`), never from `message`.
export class ClasesApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'ClasesApiError'
  }
}

export interface ClasesApi {
  setAttendance(input: SetAttendanceInput): Promise<AttendanceRecord>
  clearAttendance(input: ClassDayInput): Promise<ClassDayResult>
  /**
   * Echoes the CLASS, not the stored apunte. The apunte is a markdown file
   * now, so there is no row to hand back — and echoing a body the caller just
   * sent would invent a second source of truth for it. Callers invalidate and
   * re-read, the same way every other write here works.
   */
  saveNote(input: SaveClassNoteInput): Promise<SaveClassNoteResult>
  deleteNote(input: ClassDayInput): Promise<ClassDayResult>
}

export const clasesApi: ClasesApi = {
  async setAttendance(input) {
    return unwrapIpcResult(await window.api.clases.setAttendance(input), attendanceRecordSchema, ClasesApiError)
  },
  async clearAttendance(input) {
    return unwrapIpcResult(await window.api.clases.clearAttendance(input), classDayResultSchema, ClasesApiError)
  },
  async saveNote(input) {
    return unwrapIpcResult(await window.api.clases.saveNote(input), saveClassNoteResultSchema, ClasesApiError)
  },
  async deleteNote(input) {
    return unwrapIpcResult(await window.api.clases.deleteNote(input), classDayResultSchema, ClasesApiError)
  }
}
