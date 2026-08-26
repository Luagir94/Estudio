import { ipcMain } from 'electron'
import log from 'electron-log'
import { wouldCreateCycle } from '../../../shared/domain/prerequisiteGraph'
import type { SubjectPrerequisite } from '../../../shared/ipc/materias'
import {
  addPrerequisiteInputSchema,
  type DeletePrerequisiteResult,
  ipcErr,
  ipcOk,
  type IpcResult,
  parsePayload,
  type PlannerEntryInput,
  type PlannerEntryRecord,
  plannerEntryInputSchema,
  PREREQUISITE_CYCLE_MESSAGE,
  prerequisiteIdInputSchema,
  updatePrerequisiteInputSchema
} from '../../../shared/ipc/planificador'
import type { PlannerRepository } from '../adapters/sqlitePlannerRepository'

/**
 * Registers the `planificador:*` main-process handlers. Every branch returns
 * an `IpcResult` — nothing ever throws across the bridge.
 *
 * ONE read channel, and it serves the DRAFT only. Correlativas get no read
 * channel of their own because they ride on `materias:list` (as edges) and
 * `materias:detail` (as full records), exactly the way marks and apuntes ride
 * on the same payloads.
 *
 * Note what `planificador:addEntry` deliberately does NOT do: check whether the
 * materia is habilitada. The planner AVISA, NO DECIDE — that is the approved
 * design's own wording about the clash notice, and it governs correlativas
 * just as much. A materia whose correlativas are unmet is still yours to put
 * in a draft; the screen says why it is bloqueada and lets you decide.
 */
export function registerPlanificadorHandlers(repository: PlannerRepository): void {
  ipcMain.handle('planificador:list', (): IpcResult<PlannerEntryRecord[]> => {
    try {
      return ipcOk(repository.listEntries())
    } catch (error) {
      log.error('planificador:list failed', error)
      return ipcErr('LIST_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('planificador:addPrerequisite', (_event, payload): IpcResult<SubjectPrerequisite> => {
    const parsed = parsePayload(addPrerequisiteInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      // Acyclicity is the one rule the payload cannot carry: it is a question
      // about the edges ALREADY STORED. Read them, ask the pure guard, and
      // answer with the SAME machine-key envelope `parsePayload` produces, so
      // the renderer translates every refusal of this command one way.
      if (wouldCreateCycle(repository.listPrerequisiteEdges(), parsed.data)) {
        return ipcErr('VALIDATION_ERROR', PREREQUISITE_CYCLE_MESSAGE)
      }
      return ipcOk(repository.addPrerequisite(parsed.data))
    } catch (error) {
      log.error('planificador:addPrerequisite failed', error)
      return ipcErr('ADD_PREREQUISITE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // No cycle check here on purpose: this command changes the LEVEL and nothing
  // else (see `updatePrerequisiteInputSchema`), and a level cannot make a
  // graph cyclic. Re-pointing an edge is a remove plus an add, and the add is
  // where the guard runs.
  ipcMain.handle('planificador:updatePrerequisite', (_event, payload): IpcResult<SubjectPrerequisite> => {
    const parsed = parsePayload(updatePrerequisiteInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const updated = repository.updatePrerequisite(parsed.data)
      if (!updated) {
        return ipcErr('NOT_FOUND', `No prerequisite with id ${parsed.data.id}`)
      }
      return ipcOk(updated)
    } catch (error) {
      log.error('planificador:updatePrerequisite failed', error)
      return ipcErr('UPDATE_PREREQUISITE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Reports NOT_FOUND, unlike `planificador:removeEntry` below. The asymmetry
  // is deliberate and follows the one `clases:*` already documents: here the
  // id names a ROW the user believed existed, so its absence is news.
  ipcMain.handle('planificador:removePrerequisite', (_event, payload): IpcResult<DeletePrerequisiteResult> => {
    const parsed = parsePayload(prerequisiteIdInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      if (!repository.removePrerequisite(parsed.data.id)) {
        return ipcErr('NOT_FOUND', `No prerequisite with id ${parsed.data.id}`)
      }
      return ipcOk({ id: parsed.data.id })
    } catch (error) {
      log.error('planificador:removePrerequisite failed', error)
      return ipcErr('REMOVE_PREREQUISITE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('planificador:addEntry', (_event, payload): IpcResult<PlannerEntryRecord> => {
    const parsed = parsePayload(plannerEntryInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      return ipcOk(repository.addEntry(parsed.data))
    } catch (error) {
      log.error('planificador:addEntry failed', error)
      return ipcErr('ADD_ENTRY_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Answers ok even when the line was not in the draft. The caller asked for
  // the materia to be OUT, and it is — a NOT_FOUND here would turn a
  // double-click of the × into an error message about a state the user
  // already has (the exact call `clases:clearAttendance` makes).
  ipcMain.handle('planificador:removeEntry', (_event, payload): IpcResult<PlannerEntryInput> => {
    const parsed = parsePayload(plannerEntryInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      repository.removeEntry(parsed.data)
      return ipcOk({ periodId: parsed.data.periodId, subjectId: parsed.data.subjectId })
    } catch (error) {
      log.error('planificador:removeEntry failed', error)
      return ipcErr('REMOVE_ENTRY_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
