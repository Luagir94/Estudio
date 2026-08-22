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

/**
 * Result of the generated write path (cli-generated-artifacts spec "Generated
 * attachment write path" / design "Port Contract"). Shape matches
 * `AskGeneratedArtifactPort.saveGenerated` exactly — this method satisfies
 * that consumer-owned port structurally, no adapter needed.
 */
export type AddGeneratedAttachmentResult = { ok: true } | { ok: false; message: string }

export interface AttachmentService {
  addAttachments(subjectId: number, sourcePaths: string[]): Promise<AddAttachmentsResult>
  /**
   * Persists a content STRING (not a source file path) as a new attachment
   * for `subjectId`, marking it `origin: 'ai-generated'` (cli-generated-
   * artifacts spec "Generated attachment write path" / "Origin provenance
   * column and badge"). Reuses the same sanitized-filename convention,
   * repository insert, orphan-cleanup-on-insert-failure, and fire-and-forget
   * indexer enqueue as `addAttachments` above — no parallel write mechanism.
   */
  addGeneratedAttachment(subjectId: number, fileName: string, content: string): Promise<AddGeneratedAttachmentResult>
}

/**
 * Consumer-owned port (attachment-fts-index design "Port Contracts") —
 * `attachmentService` depends only on this shape, never on `indexadoService`
 * directly. Fired ONLY after a successful insert and NEVER awaited: a slow
 * or failing indexing job must never delay or fail the add response (spec
 * "Non-blocking upload" — the CLI-independence requirement). Implemented
 * structurally by `indexadoService.enqueue` (slice 2b), with no import
 * cycle between the two modules.
 */
export interface AttachmentIndexerPort {
  enqueue(input: { attachmentId: number; subjectId: number; storedPath: string; fileName: string }): void
}

interface CreateAttachmentServiceDeps {
  repository: AttachmentRepository
  storage: AttachmentStorage
  indexer: AttachmentIndexerPort
}

/**
 * Orchestrates the add-attachment flow over three ports (design "Copy/unlink
 * orchestration" + "Port Contracts") — repository, storage, and indexer
 * never talk to each other directly, this is the only place that sequences
 * them. Per-file isolation is the point of the loop's own try/catch: one
 * file's failure is recorded in `failures` and the loop moves on (spec "Add
 * several files at once" / "Insert fails after copy").
 */
export function createAttachmentService({
  repository,
  storage,
  indexer
}: CreateAttachmentServiceDeps): AttachmentService {
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
              createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
              // A picker-driven upload is always a 'user' origin
              // (cli-generated-artifacts spec "User upload defaults to
              // 'user' origin") — the 'ai-generated' origin is written only
              // by the generated write path (Unit 6, not this call site).
              origin: 'user'
            })
            added.push(record)
            // Fire-and-forget (design "Background execution" —
            // CLI-independence requirement): never awaited, and the port
            // contract guarantees `enqueue` itself never throws, so a slow
            // or failing indexing job can never delay or fail this
            // response (spec "Non-blocking upload").
            indexer.enqueue({
              attachmentId: record.id,
              subjectId,
              storedPath: record.storedPath,
              fileName: record.fileName
            })
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
    },

    async addGeneratedAttachment(subjectId, fileName, content) {
      const sizeBytes = Buffer.byteLength(content, 'utf8')
      // Re-sanitized here even though `artifactGate.ts` already sanitized the
      // header's fileName once — idempotent by construction, and this call
      // site must never trust an upstream caller's sanitization alone.
      const storedFileName = `${randomUUID()}-${sanitizeFileName(fileName)}`
      const storedPath = await storage.writeIntoSubjectDir(subjectId, storedFileName, content)

      try {
        const record = repository.insert({
          subjectId,
          fileName,
          storedPath,
          mimeType: null,
          sizeBytes,
          title: null,
          createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          // The generated write path is the ONLY call site that ever writes
          // 'ai-generated' (cli-generated-artifacts spec "Generated artifact
          // is marked and badged").
          origin: 'ai-generated'
        })
        // Fire-and-forget, same convention as `addAttachments` above: never
        // awaited, so a slow or failing indexing job never delays this
        // response.
        indexer.enqueue({
          attachmentId: record.id,
          subjectId,
          storedPath: record.storedPath,
          fileName: record.fileName
        })
        return { ok: true }
      } catch (insertError) {
        // Orphan-cleanup rule copied from `addAttachments` (spec "Failed
        // insert cleans up the written file"): the write already landed on
        // disk, so a failed insert must not leave it behind.
        await storage.removeFile(storedPath).catch(() => {})
        return { ok: false, message: insertError instanceof Error ? insertError.message : 'Unknown error' }
      }
    }
  }
}
