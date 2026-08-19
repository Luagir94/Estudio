import { ipcMain } from 'electron'
import log from 'electron-log'
import {
  createSubjectInputSchema,
  type DeleteSubjectResult,
  ipcErr,
  ipcOk,
  type IpcResult,
  subjectIdInputSchema,
  type SubjectDetailResult,
  type SubjectWithSlots,
  updateSubjectScheduleInputSchema
} from '../../../shared/ipc/materias'
import { setSubjectOutcomeInputSchema, type SubjectWithStatus } from '../../../shared/ipc/materias'
import type { AttachmentStorage } from '../../adjuntos/adapters/fileAttachmentStorage'
import type { SubjectRepository } from '../adapters/sqliteSubjectRepository'

interface RegisterMateriasHandlersDeps {
  attachmentStorage: AttachmentStorage
}

/**
 * Registers the `materias:create`/`materias:list` main-process handlers
 * (design §2). Every branch returns an `IpcResult` — nothing ever throws
 * across the bridge, including a repository-level atomicity failure (spec:
 * "Atomic rollback on failure" surfaces here as a clean error envelope,
 * not a crash).
 */
export function registerMateriasHandlers(
  repository: SubjectRepository,
  { attachmentStorage }: RegisterMateriasHandlersDeps
): void {
  ipcMain.handle('materias:create', (_event, payload): IpcResult<SubjectWithSlots> => {
    const parsed = createSubjectInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      return ipcOk(repository.create(parsed.data))
    } catch (error) {
      return ipcErr('CREATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('materias:list', (): IpcResult<SubjectWithSlots[]> => {
    try {
      return ipcOk(repository.list())
    } catch (error) {
      return ipcErr('LIST_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('materias:detail', (_event, payload): IpcResult<SubjectDetailResult> => {
    const parsed = subjectIdInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const detail = repository.detail(parsed.data.id)
      if (!detail) {
        return ipcErr('NOT_FOUND', `No subject with id ${parsed.data.id}`)
      }
      return ipcOk(detail)
    } catch (error) {
      return ipcErr('DETAIL_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('materias:updateSchedule', (_event, payload): IpcResult<SubjectWithSlots> => {
    const parsed = updateSubjectScheduleInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      return ipcOk(repository.updateSchedule(parsed.data))
    } catch (error) {
      return ipcErr('UPDATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Confirmation-count comes from the already-fetched materias:detail
  // payload (deadlines.length), not a separate round-trip (spec: "Subject
  // Deletion Cascade"). Attachment ROWS cascade away via the FK (PR1); the
  // FILES on disk do not, so this handler also removes the subject's whole
  // attachment directory (spec "Subject Deletion Cascades to Attachments").
  ipcMain.handle('materias:delete', async (_event, payload): Promise<IpcResult<DeleteSubjectResult>> => {
    const parsed = subjectIdInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const result = repository.remove(parsed.data.id)
      if (!result) {
        return ipcErr('NOT_FOUND', `No subject with id ${parsed.data.id}`)
      }

      // The `await` here is mandatory: without it, a rejection from
      // `removeSubjectDir` becomes an unhandled promise rejection instead
      // of reaching this catch, and `log.warn` below would never fire.
      // Best-effort ONLY — a locked or missing directory must never block
      // or reverse the subject deletion that already committed above.
      try {
        await attachmentStorage.removeSubjectDir(parsed.data.id)
      } catch (cleanupError) {
        log.warn(
          `Failed to remove attachment directory for subject ${parsed.data.id}: ${cleanupError instanceof Error ? cleanupError.message : 'Unknown error'}`
        )
      }

      return ipcOk(result)
    } catch (error) {
      return ipcErr('DELETE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // Records what happened with the subject once its period ended. Its own
  // command rather than part of `materias:updateSchedule`: that one writes
  // the subject's DEFINITION, this writes an OUTCOME, and the two change at
  // completely different moments.
  //
  // A grade the owning program's scheme does not admit surfaces as
  // OUTCOME_FAILED — the repository asks shared/domain/grading.ts, the same
  // rule the form applies.
  ipcMain.handle('materias:setOutcome', (_event, payload): IpcResult<SubjectWithStatus> => {
    const parsed = setSubjectOutcomeInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const result = repository.setOutcome(parsed.data)
      if (!result) {
        return ipcErr('NOT_FOUND', `No subject with id ${parsed.data.id}`)
      }
      return ipcOk(result)
    } catch (error) {
      return ipcErr('OUTCOME_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
