import { app, dialog, ipcMain, shell } from 'electron'
import log from 'electron-log'
import { format } from 'date-fns'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { type ExportJsonResult, openExternalInputSchema } from '../../shared/ipc/app'
import { ipcErr, ipcOk, type IpcResult } from '../../shared/ipc/materias'
import mainI18n from '../i18n'
import type { DeadlineRepository } from '../entregas/adapters/sqliteDeadlineRepository'
import type { SubjectRepository } from '../materias/adapters/sqliteSubjectRepository'
import { isAllowedExternalUrl } from './campusUrlValidator'

interface RegisterAppHandlersDeps {
  subjectRepository: SubjectRepository
  deadlineRepository: DeadlineRepository
}

/**
 * Builds the complete, human-readable export snapshot (spec: "Export
 * Content Completeness" — all three entity collections, human-readable
 * field names, no truncation). `exportedAt` is formatted via date-fns
 * `format`, NOT `toISOString()` — the latter converts to UTC and would
 * silently shift the calendar day for a late-night local export (design
 * §3a "the DST rule" — same local-naive convention as storage).
 */
function buildExportSnapshot(subjectRepository: SubjectRepository, deadlineRepository: DeadlineRepository) {
  const subjects = subjectRepository.list()
  const deadlines = deadlineRepository.list()

  return {
    exportedAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    subjects: subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      code: subject.code,
      color: subject.color,
      docente: subject.docente,
      contacto: subject.contacto,
      campusUrl: subject.campusUrl,
      notas: subject.notas,
      attendanceMinPercent: subject.attendanceMinPercent,
      scheduleSlots: subject.slots.map((slot) => ({
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        location: slot.location
      }))
    })),
    deadlines: deadlines.map((deadline) => ({
      id: deadline.id,
      subjectId: deadline.subjectId,
      subjectName: deadline.subjectName,
      title: deadline.title,
      type: deadline.type,
      dueAt: deadline.dueAt,
      done: deadline.done
    }))
  }
}

/**
 * Registers the cross-cutting `app:*` main-process handlers (design §2).
 * `app:openExternal` is the ONLY path allowed to call `shell.openExternal`
 * (design §7). `app:exportJson` is reachable from BOTH the sidebar footer
 * AND the native File menu (spec: "JSON Export Reachability") — the menu
 * triggers the SAME renderer-side mutation via the `menu:export-requested`
 * push event (see `src/main/app/exportMenu.ts`), so this handler is the
 * single place either path ever writes a file.
 */
export function registerAppHandlers({ subjectRepository, deadlineRepository }: RegisterAppHandlersDeps): void {
  ipcMain.handle('app:openExternal', (_event, payload): IpcResult<undefined> => {
    const parsed = openExternalInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    if (!isAllowedExternalUrl(parsed.data.url)) {
      log.warn(`Refused to open external URL (non-https or malformed): ${parsed.data.url}`)
      return ipcErr('URL_REFUSED', 'Only https URLs may be opened externally')
    }

    void shell.openExternal(parsed.data.url)
    return ipcOk(undefined)
  })

  ipcMain.handle('app:exportJson', async (): Promise<IpcResult<ExportJsonResult>> => {
    try {
      const defaultFileName = `course-companion-export-${format(new Date(), 'yyyy-MM-dd')}.json`
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: mainI18n.t('registerAppHandlers.exportDialogTitle'),
        defaultPath: path.join(app.getPath('documents'), defaultFileName),
        filters: [{ name: mainI18n.t('registerAppHandlers.jsonFilterName'), extensions: ['json'] }]
      })

      if (canceled || !filePath) {
        return ipcOk({ canceled: true, filePath: null })
      }

      const snapshot = buildExportSnapshot(subjectRepository, deadlineRepository)
      await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8')

      return ipcOk({ canceled: false, filePath })
    } catch (error) {
      return ipcErr('EXPORT_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
