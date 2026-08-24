import { ipcMain } from 'electron'
import log from 'electron-log'
import {
  createDeadlineInputSchema,
  deadlineIdInputSchema,
  type DeleteDeadlineResult,
  ipcErr,
  ipcOk,
  type IpcResult,
  parsePayload,
  type DeadlineWithSubject,
  setDeadlineDoneInputSchema,
  updateDeadlineInputSchema
} from '../../../shared/ipc/entregas'
import type { DeadlineRepository } from '../adapters/sqliteDeadlineRepository'

/**
 * Registers the `entregas:*` main-process handlers (design §2, amendment 7:
 * full CRUD — unlike `materias:*`'s slot commands, Deadline owns its own
 * command set). Every branch returns an `IpcResult` — nothing ever throws
 * across the bridge.
 */
export function registerEntregasHandlers(repository: DeadlineRepository): void {
  ipcMain.handle('entregas:create', (_event, payload): IpcResult<DeadlineWithSubject> => {
    const parsed = parsePayload(createDeadlineInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      return ipcOk(repository.create(parsed.data))
    } catch (error) {
      log.error('entregas:create failed', error)
      return ipcErr('CREATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('entregas:list', (): IpcResult<DeadlineWithSubject[]> => {
    try {
      return ipcOk(repository.list())
    } catch (error) {
      log.error('entregas:list failed', error)
      return ipcErr('LIST_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Reuses the create schema plus `id` (spec: "Edit corrects a wrong fecha
  // límite" — "Editing MUST reuse the 'Nueva entrega' form and the same
  // validation schema used for creation").
  ipcMain.handle('entregas:update', (_event, payload): IpcResult<DeadlineWithSubject> => {
    const parsed = parsePayload(updateDeadlineInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const result = repository.update(parsed.data)
      if (!result) {
        return ipcErr('NOT_FOUND', `No deadline with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      log.error('entregas:update failed', error)
      return ipcErr('UPDATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Binary only — no partial-progress state (spec: "Toggle done/pending").
  ipcMain.handle('entregas:setDone', (_event, payload): IpcResult<DeadlineWithSubject> => {
    const parsed = parsePayload(setDeadlineDoneInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const result = repository.setDone(parsed.data.id, parsed.data.done)
      if (!result) {
        return ipcErr('NOT_FOUND', `No deadline with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      log.error('entregas:setDone failed', error)
      return ipcErr('SETDONE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Removes the deadline ENTIRELY — never marks it done (spec: "Delete
  // removes a cancelled deadline entirely, not as done"; "Deleting a
  // deadline cascades to nothing").
  ipcMain.handle('entregas:delete', (_event, payload): IpcResult<DeleteDeadlineResult> => {
    const parsed = parsePayload(deadlineIdInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const removed = repository.remove(parsed.data.id)
      if (!removed) {
        return ipcErr('NOT_FOUND', `No deadline with id ${parsed.data.id}`)
      }
      return ipcOk({ id: parsed.data.id })
    } catch (error) {
      log.error('entregas:delete failed', error)
      return ipcErr('DELETE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
