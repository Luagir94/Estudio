import { dialog, ipcMain, shell } from 'electron'
import log from 'electron-log'
import {
  type Attachment,
  type AddAttachmentsResult,
  addAttachmentsInputSchema,
  deleteAttachmentInputSchema,
  type DeleteAttachmentResult,
  ipcErr,
  ipcOk,
  type IpcResult,
  listAttachmentsInputSchema,
  openAttachmentInputSchema,
  readAttachmentTextInputSchema,
  type ReadAttachmentTextResult,
  writeAttachmentTextInputSchema
} from '../../../shared/ipc/adjuntos'
import { ADJUNTOS_READ_CHANNEL, ADJUNTOS_WRITE_CHANNEL } from '../../../shared/ipc/channels'
import type { AttachmentStorage } from '../adapters/fileAttachmentStorage'
import type { AttachmentRecord, AttachmentRepository } from '../adapters/sqliteAttachmentRepository'
import type { AttachmentService } from '../attachmentService'

interface SubjectExistenceCheck {
  detail(id: number): unknown
}

interface RegisterAdjuntosHandlersDeps {
  repository: AttachmentRepository
  service: AttachmentService
  storage: AttachmentStorage
  /** Only used to answer "does this subject exist?" for `adjuntos:add` — the full `SubjectRepository` satisfies this. */
  subjectRepository: SubjectExistenceCheck
}

function toAttachment(record: AttachmentRecord): Attachment {
  return {
    id: record.id,
    subjectId: record.subjectId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    title: record.title,
    createdAt: record.createdAt,
    indexStatus: record.indexStatus,
    origin: record.origin
  }
}

/**
 * Registers the `adjuntos:*` main-process handlers (design "IPC Contract
 * (PR2)"), modeled on `registerAppHandlers.ts`. Every branch returns an
 * `IpcResult` — nothing ever throws across the bridge. `storedPath` is
 * resolved via the storage port ONLY, never joined here directly (design
 * "Path Handling").
 */
export function registerAdjuntosHandlers({
  repository,
  service,
  storage,
  subjectRepository
}: RegisterAdjuntosHandlersDeps): void {
  ipcMain.handle('adjuntos:list', (_event, payload): IpcResult<Attachment[]> => {
    const parsed = listAttachmentsInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      return ipcOk(repository.listBySubject(parsed.data.subjectId).map(toAttachment))
    } catch (error) {
      return ipcErr('LIST_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('adjuntos:add', async (_event, payload): Promise<IpcResult<AddAttachmentsResult>> => {
    const parsed = addAttachmentsInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    if (!subjectRepository.detail(parsed.data.subjectId)) {
      return ipcErr('NOT_FOUND', `No subject with id ${parsed.data.subjectId}`)
    }

    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'] },
          { name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
          { name: 'Todos los archivos', extensions: ['*'] }
        ]
      })

      if (canceled || filePaths.length === 0) {
        return ipcOk({ canceled: true, added: [], failures: [] })
      }

      const { added, failures } = await service.addAttachments(parsed.data.subjectId, filePaths)
      return ipcOk({ canceled: false, added: added.map(toAttachment), failures })
    } catch (error) {
      return ipcErr('ADD_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('adjuntos:open', async (_event, payload): Promise<IpcResult<undefined>> => {
    const parsed = openAttachmentInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    const row = repository.get(parsed.data.id)
    if (!row) {
      return ipcErr('NOT_FOUND', `No attachment with id ${parsed.data.id}`)
    }

    // A tampered/stale row whose storedPath escapes the attachments root is
    // an OPEN failure (design threat matrix: INVALID_PATH → OPEN_FAILED) —
    // distinct from a legitimately missing file below.
    let absolutePath: string
    try {
      absolutePath = storage.resolveStoredPath(row.storedPath)
    } catch (error) {
      return ipcErr('OPEN_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }

    try {
      await storage.statSize(absolutePath)
    } catch {
      return ipcErr('ATTACHMENT_FILE_MISSING', `The file for attachment ${parsed.data.id} could not be found`)
    }

    const openError = await shell.openPath(absolutePath)
    if (openError) {
      return ipcErr('OPEN_FAILED', openError)
    }

    return ipcOk(undefined)
  })

  ipcMain.handle('adjuntos:delete', async (_event, payload): Promise<IpcResult<DeleteAttachmentResult>> => {
    const parsed = deleteAttachmentInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    // The row commits FIRST (spec "Delete Attachment") — a locked or
    // already-missing file must never block or reverse it.
    const removed = repository.remove(parsed.data.id)
    if (!removed) {
      return ipcErr('NOT_FOUND', `No attachment with id ${parsed.data.id}`)
    }

    let fileRemoved = true
    try {
      await storage.removeFile(removed.storedPath)
    } catch (error) {
      fileRemoved = false
      log.warn(
        `Failed to remove attachment file for id ${parsed.data.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }

    return ipcOk({ id: parsed.data.id, fileRemoved })
  })

  // markdown-attachment-viewer — the viewer's read channel. The service
  // returns a typed result (never throws by design); its error code maps 1:1
  // onto the envelope. The try/catch is the never-throw-across-the-bridge
  // backstop for a bug in the service itself.
  ipcMain.handle(ADJUNTOS_READ_CHANNEL, async (_event, payload): Promise<IpcResult<ReadAttachmentTextResult>> => {
    const parsed = readAttachmentTextInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const result = await service.readAttachmentText(parsed.data.id)
      if (!result.ok) {
        return ipcErr(result.code, result.message)
      }
      return ipcOk({ content: result.content })
    } catch (error) {
      return ipcErr('READ_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // markdown-attachment-viewer — the editor's save channel. The updated row
  // rides back (minus storedPath, via `toAttachment`) so the viewer header
  // refreshes without a second round-trip.
  ipcMain.handle(ADJUNTOS_WRITE_CHANNEL, async (_event, payload): Promise<IpcResult<Attachment>> => {
    const parsed = writeAttachmentTextInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const result = await service.updateAttachmentText(parsed.data.id, parsed.data.content)
      if (!result.ok) {
        return ipcErr(result.code, result.message)
      }
      return ipcOk(toAttachment(result.attachment))
    } catch (error) {
      return ipcErr('WRITE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
