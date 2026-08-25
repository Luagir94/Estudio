import { ipcMain } from 'electron'
import log from 'electron-log'
import {
  classDayInputSchema,
  type ClassDayResult,
  ipcErr,
  ipcOk,
  type IpcResult,
  parsePayload,
  saveClassNoteInputSchema,
  setAttendanceInputSchema
} from '../../../shared/ipc/clases'
import type { AttendanceRecord, ClassNoteRecord } from '../../../shared/ipc/materias'
import type { ClaseRepository } from '../adapters/sqliteClaseRepository'

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
export function registerClasesHandlers(repository: ClaseRepository): void {
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

  ipcMain.handle('clases:saveNote', (_event, payload): IpcResult<ClassNoteRecord> => {
    const parsed = parsePayload(saveClassNoteInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      return ipcOk(repository.saveNote(parsed.data))
    } catch (error) {
      log.error('clases:saveNote failed', error)
      return ipcErr('SAVE_NOTE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('clases:deleteNote', (_event, payload): IpcResult<ClassDayResult> => {
    const parsed = parsePayload(classDayInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      repository.deleteNote(parsed.data)
      return ipcOk({ subjectId: parsed.data.subjectId, date: parsed.data.date })
    } catch (error) {
      log.error('clases:deleteNote failed', error)
      return ipcErr('DELETE_NOTE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
