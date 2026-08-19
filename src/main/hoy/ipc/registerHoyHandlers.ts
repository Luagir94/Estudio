import { ipcMain } from 'electron'
import type { DashboardResult } from '../../../shared/ipc/hoy'
import { ipcErr, ipcOk, type IpcResult } from '../../../shared/ipc/materias'
import type { DeadlineRepository } from '../../entregas/adapters/sqliteDeadlineRepository'
import type { SubjectRepository } from '../../materias/adapters/sqliteSubjectRepository'

/**
 * Registers the `hoy:dashboard` main-process handler (design §2; spec:
 * "Hoy MUST be a pure read-model introducing no new persisted data"). This
 * is the ONLY channel this module registers — no command channel exists.
 * Reuses the SAME `SubjectRepository`/`DeadlineRepository` instances
 * `materias:*`/`horario:week`/`entregas:*` already use (design §2: "Both
 * handler sets share ONE repository instance"), never a separate table or
 * write path.
 */
export function registerHoyHandlers(
  subjectRepository: SubjectRepository,
  deadlineRepository: DeadlineRepository
): void {
  ipcMain.handle('hoy:dashboard', (): IpcResult<DashboardResult> => {
    try {
      return ipcOk({
        subjects: subjectRepository.list(),
        deadlines: deadlineRepository.list()
      })
    } catch (error) {
      return ipcErr('DASHBOARD_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
