import { ipcMain } from 'electron'
import log from 'electron-log'
import {
  academicDateIdInputSchema,
  type AcademicDateRecord,
  type AcademicDateWithProgram,
  createAcademicDateInputSchema,
  type DeleteAcademicDateResult,
  ipcErr,
  ipcOk,
  type IpcResult,
  parsePayload,
  updateAcademicDateInputSchema
} from '../../../shared/ipc/fechas'
import type { AcademicDateRepository } from '../adapters/sqliteAcademicDateRepository'

/**
 * Registers the `fechas:*` main-process handlers. Every branch returns an
 * `IpcResult` — nothing ever throws across the bridge.
 *
 * There is deliberately no "mark as done" command: an administrative date has
 * no manual completion, so recording it and correcting it is the whole
 * lifecycle (see `db/schema.ts`'s `academicDates` comment).
 */
export function registerFechasHandlers(repository: AcademicDateRepository): void {
  ipcMain.handle('fechas:list', (): IpcResult<AcademicDateWithProgram[]> => {
    try {
      return ipcOk(repository.list())
    } catch (error) {
      log.error('fechas:list failed', error)
      return ipcErr('LIST_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('fechas:create', (_event, payload): IpcResult<AcademicDateRecord> => {
    const parsed = parsePayload(createAcademicDateInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      return ipcOk(repository.create(parsed.data))
    } catch (error) {
      log.error('fechas:create failed', error)
      return ipcErr('CREATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('fechas:update', (_event, payload): IpcResult<AcademicDateRecord> => {
    const parsed = parsePayload(updateAcademicDateInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const result = repository.update(parsed.data)
      if (!result) {
        return ipcErr('NOT_FOUND', `No academic date with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      log.error('fechas:update failed', error)
      return ipcErr('UPDATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('fechas:delete', (_event, payload): IpcResult<DeleteAcademicDateResult> => {
    const parsed = parsePayload(academicDateIdInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const removed = repository.remove(parsed.data.id)
      if (!removed) {
        return ipcErr('NOT_FOUND', `No academic date with id ${parsed.data.id}`)
      }
      return ipcOk({ id: parsed.data.id })
    } catch (error) {
      log.error('fechas:delete failed', error)
      return ipcErr('DELETE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
