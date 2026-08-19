import { ipcMain } from 'electron'
import {
  createPeriodInputSchema,
  createProgramInputSchema,
  type DeletePeriodResult,
  type DeleteProgramResult,
  ipcErr,
  ipcOk,
  type IpcResult,
  periodIdInputSchema,
  type PeriodRecord,
  programIdInputSchema,
  type ProgramRecord,
  type ProgramWithPeriods,
  updatePeriodInputSchema,
  updateProgramInputSchema
} from '../../../shared/ipc/carreras'
import type { ProgramRepository } from '../adapters/sqliteProgramRepository'

/**
 * Registers the `carreras:*` main-process handlers (design §2). Every branch
 * returns an `IpcResult` — nothing ever throws across the bridge.
 *
 * Program is the aggregate root for periods, so `createPeriod` lives here
 * rather than in a `periodos:*` domain of its own: a period without a program
 * is not a thing the app can represent.
 */
export function registerCarrerasHandlers(repository: ProgramRepository): void {
  ipcMain.handle('carreras:create', (_event, payload): IpcResult<ProgramRecord> => {
    const parsed = createProgramInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      return ipcOk(repository.create(parsed.data))
    } catch (error) {
      return ipcErr('CREATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('carreras:list', (): IpcResult<ProgramWithPeriods[]> => {
    try {
      return ipcOk(repository.list())
    } catch (error) {
      return ipcErr('LIST_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('carreras:detail', (_event, payload): IpcResult<ProgramWithPeriods> => {
    const parsed = programIdInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const result = repository.detail(parsed.data.id)
      if (!result) {
        return ipcErr('NOT_FOUND', `No program with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      return ipcErr('DETAIL_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Corrects the program itself. The scheme and scale are accepted here — a
  // carrera with nothing graded yet is allowed to fix them — and whether THIS
  // carrera still has that room is decided by the renderer's domain rule, not
  // by this handler (see updateProgramInputSchema).
  ipcMain.handle('carreras:update', (_event, payload): IpcResult<ProgramRecord> => {
    const parsed = updateProgramInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const result = repository.update(parsed.data)
      if (!result) {
        return ipcErr('NOT_FOUND', `No program with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      return ipcErr('UPDATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // The schema accepts a null `endsOn` (an open-ended period) and only orders
  // the dates when there is an end to order.
  ipcMain.handle('carreras:createPeriod', (_event, payload): IpcResult<PeriodRecord> => {
    const parsed = createPeriodInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      return ipcOk(repository.createPeriod(parsed.data))
    } catch (error) {
      return ipcErr('CREATE_PERIOD_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Same schema as createPeriod plus the id, minus the programId — a period
  // is corrected in place, it never moves to another carrera.
  ipcMain.handle('carreras:updatePeriod', (_event, payload): IpcResult<PeriodRecord> => {
    const parsed = updatePeriodInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const result = repository.updatePeriod(parsed.data)
      if (!result) {
        return ipcErr('NOT_FOUND', `No period with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      return ipcErr('UPDATE_PERIOD_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Deletes one period. Its subjects are NOT destroyed — they fall back to
  // "sin período" and the result reports how many, for the dialog.
  ipcMain.handle('carreras:deletePeriod', (_event, payload): IpcResult<DeletePeriodResult> => {
    const parsed = periodIdInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const result = repository.removePeriod(parsed.data.id)
      if (!result) {
        return ipcErr('NOT_FOUND', `No period with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      return ipcErr('DELETE_PERIOD_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Cascades to the program's periods; its subjects survive with a NULL
  // period (the result reports how many, for the confirmation dialog).
  ipcMain.handle('carreras:delete', (_event, payload): IpcResult<DeleteProgramResult> => {
    const parsed = programIdInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const result = repository.remove(parsed.data.id)
      if (!result) {
        return ipcErr('NOT_FOUND', `No program with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      return ipcErr('DELETE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
