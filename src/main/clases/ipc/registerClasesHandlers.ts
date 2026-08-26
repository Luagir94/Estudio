import { ipcMain } from 'electron'
import log from 'electron-log'
import {
  classDayInputSchema,
  ipcErr,
  ipcOk,
  parsePayload,
  saveClassNoteInputSchema,
  setAttendanceInputSchema,
  type ClassDayResult,
  type IpcResult,
  type SaveClassNoteResult
} from '../../../shared/ipc/clases'
import type { AttendanceRecord } from '../../../shared/ipc/materias'
import type { ClaseRepository } from '../adapters/sqliteClaseRepository'

/**
 * Consumer-owned port (same convention as `AttachmentIndexerPort`): the two
 * apunte writes this slice needs, and nothing else.
 *
 * Narrow ON PURPOSE. An apunte is a markdown attachment, so its writes belong
 * to `attachmentService` — but the clases slice has no business knowing how
 * to add a file, read one, or re-index it. It states the two verbs it needs
 * and the composition root supplies them.
 */
export interface ClassNoteWriterPort {
  /** Writes or rewrites the apunte for one class. Emptying it DELETES it. */
  save(
    subjectId: number,
    classDate: string,
    content: string
  ): Promise<
    | { ok: true; deleted: true }
    | { ok: true; deleted: false; apunteId: number }
    | { ok: false; code: string; message: string }
  >
  /** Removes the apunte. Resolving is enough — a class that had none is not an error. */
  remove(subjectId: number, classDate: string): Promise<unknown>
}

/**
 * Registers the `clases:*` main-process handlers. Every branch returns an
 * `IpcResult` — nothing ever throws across the bridge.
 *
 * There is deliberately no read channel here: marks and apuntes ride on
 * `materias:detail` and `hoy:dashboard`, the same way final exams and
 * parciales do.
 *
 * Both CLEAR commands answer `ok` even when there was nothing stored. The
 * caller asked for a class to end up unmarked (or without an apunte), and it
 * did — a `NOT_FOUND` here would turn the second click of a toggle, or a
 * double-submit of the modal, into an error message about a state the user
 * already has. Deleting a PARCIAL is a different case and reports NOT_FOUND
 * on purpose: there the id names a row the user believed existed.
 */
export function registerClasesHandlers(repository: ClaseRepository, classNotes: ClassNoteWriterPort): void {
  ipcMain.handle('clases:setAttendance', (_event, payload): IpcResult<AttendanceRecord> => {
    const parsed = parsePayload(setAttendanceInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      return ipcOk(repository.setAttendance(parsed.data))
    } catch (error) {
      log.error('clases:setAttendance failed', error)
      return ipcErr('SET_ATTENDANCE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('clases:clearAttendance', (_event, payload): IpcResult<ClassDayResult> => {
    const parsed = parsePayload(classDayInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      repository.clearAttendance(parsed.data)
      return ipcOk({ subjectId: parsed.data.subjectId, date: parsed.data.date })
    } catch (error) {
      log.error('clases:clearAttendance failed', error)
      return ipcErr('CLEAR_ATTENDANCE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Both note commands route to `attachmentService`, NOT to the clase
  // repository: an apunte is a markdown attachment, so writing one means a
  // file, a preview and an FTS re-index — three things the service already
  // sequences for every other document. A second write path that only touched
  // the row would produce apuntes the editor cannot open and the AI cannot
  // find, which is the exact failure this feature exists to end.
  ipcMain.handle('clases:saveNote', async (_event, payload): Promise<IpcResult<SaveClassNoteResult>> => {
    const parsed = parsePayload(saveClassNoteInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const result = await classNotes.save(parsed.data.subjectId, parsed.data.date, parsed.data.body)
      if (!result.ok) {
        return ipcErr(result.code, result.message)
      }
      // An emptied apunte is a DELETED apunte, so there is no id to hand back
      // and no document to open. The caller asked to save nothing and got its
      // wish — a NOT_FOUND here would be an error about a state it wanted.
      if (result.deleted) {
        return ipcErr('NOTE_DELETED', 'The apunte was emptied, so it was deleted')
      }
      return ipcOk({ subjectId: parsed.data.subjectId, date: parsed.data.date, apunteId: result.apunteId })
    } catch (error) {
      log.error('clases:saveNote failed', error)
      return ipcErr('SAVE_NOTE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('clases:deleteNote', async (_event, payload): Promise<IpcResult<ClassDayResult>> => {
    const parsed = parsePayload(classDayInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      await classNotes.remove(parsed.data.subjectId, parsed.data.date)
      return ipcOk({ subjectId: parsed.data.subjectId, date: parsed.data.date })
    } catch (error) {
      log.error('clases:deleteNote failed', error)
      return ipcErr('DELETE_NOTE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
