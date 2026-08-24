import { ipcMain } from 'electron'
import log from 'electron-log'
import {
  createFinalExamInputSchema,
  type DeleteFinalExamResult,
  finalExamIdInputSchema,
  ipcErr,
  ipcOk,
  type IpcResult,
  parsePayload,
  updateFinalExamInputSchema
} from '../../../shared/ipc/finales'
import type { FinalExamRecord } from '../../../shared/ipc/materias'
import type { FinalExamRepository } from '../adapters/sqliteFinalExamRepository'

/**
 * Registers the `finales:*` main-process handlers. Every branch returns an
 * `IpcResult` — nothing ever throws across the bridge.
 *
 * There is deliberately no "close the subject" command here: the subject's
 * state falls out of these rows, so recording a result is the whole action.
 */
export function registerFinalesHandlers(repository: FinalExamRepository): void {
  ipcMain.handle('finales:create', (_event, payload): IpcResult<FinalExamRecord> => {
    const parsed = parsePayload(createFinalExamInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      return ipcOk(repository.create(parsed.data))
    } catch (error) {
      log.error('finales:create failed', error)
      return ipcErr('CREATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('finales:update', (_event, payload): IpcResult<FinalExamRecord> => {
    const parsed = parsePayload(updateFinalExamInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const result = repository.update(parsed.data)
      if (!result) {
        return ipcErr('NOT_FOUND', `No final exam with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      log.error('finales:update failed', error)
      return ipcErr('UPDATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('finales:delete', (_event, payload): IpcResult<DeleteFinalExamResult> => {
    const parsed = parsePayload(finalExamIdInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const removed = repository.remove(parsed.data.id)
      if (!removed) {
        return ipcErr('NOT_FOUND', `No final exam with id ${parsed.data.id}`)
      }
      return ipcOk({ id: parsed.data.id })
    } catch (error) {
      log.error('finales:delete failed', error)
      return ipcErr('DELETE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
