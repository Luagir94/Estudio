import { ipcMain } from 'electron'
import log from 'electron-log'
import { ipcErr, ipcOk, type IpcResult } from '../../../shared/ipc/materias'
import type { WeekScheduleResult } from '../../../shared/ipc/horario'
import type { SubjectRepository } from '../../materias/adapters/sqliteSubjectRepository'

/**
 * Registers the `horario:week` main-process handler (design §2; spec:
 * "Read-Only Schedule Projection"). This is the ONLY channel this module
 * registers — no create/delete-class command exists, matching the spec's
 * "Editing a class routes through the subject" requirement. It reads the
 * SAME subjects+slots data as `materias:list` (Subject remains the
 * aggregate root; slots only ever move through `materias:create`/
 * `materias:updateSchedule`), just via a separate query channel for this
 * domain's own screaming-architecture boundary.
 */
export function registerHorarioHandlers(repository: SubjectRepository): void {
  ipcMain.handle('horario:week', (): IpcResult<WeekScheduleResult> => {
    try {
      return ipcOk(repository.list())
    } catch (error) {
      log.error('horario:week failed', error)
      return ipcErr('WEEK_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
