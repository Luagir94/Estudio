import { ipcMain } from 'electron'
import {
  createFinalExamInputSchema,
  type DeleteFinalExamResult,
  finalExamIdInputSchema,
  ipcErr,
  ipcOk,
  type IpcResult,
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
    const parsed = createFinalExamInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      return ipcOk(repository.create(parsed.data))
    } catch (error) {
      return ipcErr('CREATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('finales:update', (_event, payload): IpcResult<FinalExamRecord> => {
    const parsed = updateFinalExamInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const result = repository.update(parsed.data)
      if (!result) {
        return ipcErr('NOT_FOUND', `No final exam with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      return ipcErr('UPDATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('finales:delete', (_event, payload): IpcResult<DeleteFinalExamResult> => {
    const parsed = finalExamIdInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const removed = repository.remove(parsed.data.id)
      if (!removed) {
        return ipcErr('NOT_FOUND', `No final exam with id ${parsed.data.id}`)
      }
      return ipcOk({ id: parsed.data.id })
    } catch (error) {
      return ipcErr('DELETE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
