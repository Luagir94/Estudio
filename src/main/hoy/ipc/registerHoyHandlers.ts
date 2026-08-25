import { ipcMain } from 'electron'
import log from 'electron-log'
import type { DashboardResult } from '../../../shared/ipc/hoy'
import { ipcErr, ipcOk, type IpcResult } from '../../../shared/ipc/materias'
import type { ClaseRepository } from '../../clases/adapters/sqliteClaseRepository'
import type { DeadlineRepository } from '../../entregas/adapters/sqliteDeadlineRepository'
import type { SubjectRepository } from '../../materias/adapters/sqliteSubjectRepository'

/**
 * Registers the `hoy:dashboard` main-process handler (design §2). This is
 * still the ONLY channel this module registers — no command channel exists
 * here. Reuses the SAME `SubjectRepository`/`DeadlineRepository`/
 * `ClaseRepository` instances `materias:*`/`horario:week`/`entregas:*`/
 * `clases:*` already use (design §2: "Both handler sets share ONE repository
 * instance"), never a separate table or write path.
 *
 * Hoy's original "introduces no new persisted data" rule ended with this
 * feature, deliberately and by approved design: marking a class from the
 * day's own list is the whole point of putting the marks there. What survives
 * intact is the rule that matters for THIS module — the payload stays a raw
 * read, unfiltered by any clock, and every derivation still happens in the
 * renderer at render time. The WRITES live on `clases:*`, not here.
 */
export function registerHoyHandlers(
  subjectRepository: SubjectRepository,
  deadlineRepository: DeadlineRepository,
  claseRepository: ClaseRepository
): void {
  ipcMain.handle('hoy:dashboard', (): IpcResult<DashboardResult> => {
    try {
      return ipcOk({
        subjects: subjectRepository.list(),
        deadlines: deadlineRepository.list(),
        // Unfiltered on purpose — see `shared/ipc/hoy.ts`: main does not know
        // what "today" is, and a payload that did would go stale at midnight.
        attendance: claseRepository.listAttendance(),
        classNotes: claseRepository.listNotes()
      })
    } catch (error) {
      log.error('hoy:dashboard failed', error)
      return ipcErr('DASHBOARD_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
