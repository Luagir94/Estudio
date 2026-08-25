import { ipcMain } from 'electron'
import log from 'electron-log'
import {
  createPartialExamInputSchema,
  type DeletePartialExamResult,
  ipcErr,
  ipcOk,
  type IpcResult,
  parsePayload,
  partialExamIdInputSchema,
  updatePartialExamInputSchema
} from '../../../shared/ipc/parciales'
import type { PartialExamRecord } from '../../../shared/ipc/materias'
import type { PartialExamRepository } from '../adapters/sqlitePartialExamRepository'

/**
 * Registers the `parciales:*` main-process handlers. Every branch returns an
 * `IpcResult` — nothing ever throws across the bridge.
 *
 * There is deliberately no read channel here: the rows ride on
 * `materias:detail`, the same way final exams do.
 *
 * There is deliberately no "declare the condición" command here either. The
 * regularidad is a SUBJECT column and no parcial decides it, so it travels on
 * `materias:updateSchedule`.
 */
export function registerParcialesHandlers(repository: PartialExamRepository): void {
  ipcMain.handle('parciales:create', (_event, payload): IpcResult<PartialExamRecord> => {
    const parsed = parsePayload(createPartialExamInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      return ipcOk(repository.create(parsed.data))
    } catch (error) {
      log.error('parciales:create failed', error)
      return ipcErr('CREATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('parciales:update', (_event, payload): IpcResult<PartialExamRecord> => {
    const parsed = parsePayload(updatePartialExamInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const result = repository.update(parsed.data)
      if (!result) {
        return ipcErr('NOT_FOUND', `No partial exam with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      log.error('parciales:update failed', error)
      return ipcErr('UPDATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('parciales:delete', (_event, payload): IpcResult<DeletePartialExamResult> => {
    const parsed = parsePayload(partialExamIdInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const removed = repository.remove(parsed.data.id)
      if (!removed) {
        return ipcErr('NOT_FOUND', `No partial exam with id ${parsed.data.id}`)
      }
      return ipcOk({ id: parsed.data.id })
    } catch (error) {
      log.error('parciales:delete failed', error)
      return ipcErr('DELETE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
