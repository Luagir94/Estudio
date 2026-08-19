import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { format } from 'date-fns'
import type { AttachmentStorage } from './adapters/fileAttachmentStorage'
import type { AttachmentRecord, AttachmentRepository } from './adapters/sqliteAttachmentRepository'
import { sanitizeFileName } from './domain/attachmentPaths'
import { MAX_ATTACHMENT_BYTES } from './domain/limits'

export interface AddAttachmentFailure {
  fileName: string
  code: 'FILE_TOO_LARGE' | 'COPY_FAILED'
  message: string
}

export interface AddAttachmentsResult {
  added: AttachmentRecord[]
  failures: AddAttachmentFailure[]
}

export interface AttachmentService {
  addAttachments(subjectId: number, sourcePaths: string[]): Promise<AddAttachmentsResult>
}

interface CreateAttachmentServiceDeps {
  repository: AttachmentRepository
  storage: AttachmentStorage
}

/**
 * Orchestrates the add-attachment flow over two ports (design "Copy/unlink
 * orchestration") — repository and storage never talk to each other
 * directly, this is the only place that sequences them. Per-file isolation
 * is the point of the loop's own try/catch: one file's failure is recorded
 * in `failures` and the loop moves on (spec "Add several files at once" /
 * "Insert fails after copy").
 */
export function createAttachmentService({ repository, storage }: CreateAttachmentServiceDeps): AttachmentService {
  return {
    async addAttachments(subjectId, sourcePaths) {
      const added: AttachmentRecord[] = []
      const failures: AddAttachmentFailure[] = []

      for (const sourcePath of sourcePaths) {
        const fileName = path.basename(sourcePath)

        try {
          // Size is checked BEFORE any copy (spec "Size Cap Enforcement") —
          // a file over the cap must leave no partial or full copy on disk.
          const sizeBytes = await storage.statSize(sourcePath)
          if (sizeBytes > MAX_ATTACHMENT_BYTES) {
            failures.push({
              fileName,
              code: 'FILE_TOO_LARGE',
              message: `${fileName} exceeds the ${MAX_ATTACHMENT_BYTES}-byte limit`
            })
            continue
          }

          const storedFileName = `${randomUUID()}-${sanitizeFileName(fileName)}`
          const storedPath = await storage.copyIntoSubjectDir(subjectId, sourcePath, storedFileName)

          try {
            const record = repository.insert({
              subjectId,
              fileName,
              storedPath,
              mimeType: null,
              sizeBytes,
              title: null,
              createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm")
            })
            added.push(record)
          } catch (insertError) {
            // The copy already landed on disk — a failed insert must not
            // leave an orphaned file behind (spec "Insert fails after copy").
            await storage.removeFile(storedPath).catch(() => {})
            failures.push({
              fileName,
              code: 'COPY_FAILED',
              message: insertError instanceof Error ? insertError.message : 'Unknown error'
            })
          }
        } catch (error) {
          failures.push({
            fileName,
            code: 'COPY_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      return { added, failures }
    }
  }
}
