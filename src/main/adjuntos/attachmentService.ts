import { randomUUID } from 'node:crypto'
import path from 'node:path'
import log from 'electron-log'
import { format } from 'date-fns'
import { MAX_MARKDOWN_TEXT_BYTES } from '../../shared/ipc/adjuntos'
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

/**
 * Typed error codes for the markdown viewer's read path — the IPC handler
 * maps these 1:1 onto `ipcErr` codes, so the union IS the channel contract
 * (markdown-attachment-viewer). `READ_FAILED` also covers a tampered/stale
 * row whose storedPath escapes the attachments root (same INVALID_PATH →
 * failure mapping as the open handler).
 */
export type ReadAttachmentTextErrorCode =
  'ATTACHMENT_NOT_FOUND' | 'NOT_MARKDOWN' | 'ATTACHMENT_FILE_MISSING' | 'FILE_TOO_LARGE' | 'READ_FAILED'

export type ReadAttachmentTextServiceResult =
  { ok: true; content: string } | { ok: false; code: ReadAttachmentTextErrorCode; message: string }

export type UpdateAttachmentTextErrorCode = 'ATTACHMENT_NOT_FOUND' | 'NOT_MARKDOWN' | 'FILE_TOO_LARGE' | 'WRITE_FAILED'

export type UpdateAttachmentTextServiceResult =
  { ok: true; attachment: AttachmentRecord } | { ok: false; code: UpdateAttachmentTextErrorCode; message: string }

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
  /**
   * The in-app viewer's read path (markdown-attachment-viewer): only `.md`
   * attachments, capped at 1 MiB, returned as a UTF-8 STRING — the renderer
   * never receives a filesystem path.
   */
  readAttachmentText(id: number): Promise<ReadAttachmentTextServiceResult>
  /**
   * The editor's save path: rewrites the SAME stored file in place, persists
   * the new sizeBytes, flips indexStatus back to 'pending', notifies every
   * renderer, and re-enqueues indexing (fire-and-forget — `replaceChunks`
   * makes the re-index idempotent).
   */
  updateAttachmentText(id: number, content: string): Promise<UpdateAttachmentTextServiceResult>
}

/** Case-insensitive: `resumen.MD` is as much markdown as `resumen.md`. */
function isMarkdownFileName(fileName: string): boolean {
  return /\.md$/i.test(fileName)
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
  /**
   * Fans out an index-status change to every renderer window — the SAME
   * injected-function seam `indexadoService` already uses (attachment-fts-
   * index design "Renderer notify"), so this module never imports Electron.
   * Fired by `updateAttachmentText` when a save flips the row back to
   * 'pending', so an open Adjuntos list in another window sees the badge
   * move without its own save round-trip.
   */
  notifyStatusChanged: (subjectId: number) => void
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
  indexer,
  notifyStatusChanged
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
            log.error(`attachmentService.addAttachments failed for ${fileName}`, insertError)
            await storage.removeFile(storedPath).catch(() => {})
            failures.push({
              fileName,
              code: 'COPY_FAILED',
              message: insertError instanceof Error ? insertError.message : 'Unknown error'
            })
          }
        } catch (error) {
          log.error(`attachmentService.addAttachments failed for ${fileName}`, error)
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
        log.error(`attachmentService.addGeneratedAttachment failed for ${fileName}`, insertError)
        await storage.removeFile(storedPath).catch(() => {})
        return { ok: false, message: insertError instanceof Error ? insertError.message : 'Unknown error' }
      }
    },

    async readAttachmentText(id) {
      const row = repository.get(id)
      if (!row) {
        return { ok: false, code: 'ATTACHMENT_NOT_FOUND', message: `No attachment with id ${id}` }
      }
      if (!isMarkdownFileName(row.fileName)) {
        return { ok: false, code: 'NOT_MARKDOWN', message: `${row.fileName} is not a .md file` }
      }

      // Resolved through the storage port's single choke point — a tampered
      // row whose storedPath escapes the root fails HERE, before any fs call.
      let absolutePath: string
      try {
        absolutePath = storage.resolveStoredPath(row.storedPath)
      } catch (error) {
        log.error(`attachmentService.readAttachmentText failed for attachment ${id}`, error)
        return { ok: false, code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Unknown error' }
      }

      // Stat before read (same order as the open handler): a legitimately
      // missing file is its own condition, distinct from a failed read.
      let sizeBytes: number
      try {
        sizeBytes = await storage.statSize(absolutePath)
      } catch {
        return {
          ok: false,
          code: 'ATTACHMENT_FILE_MISSING',
          message: `The file for attachment ${id} could not be found`
        }
      }

      if (sizeBytes > MAX_MARKDOWN_TEXT_BYTES) {
        return {
          ok: false,
          code: 'FILE_TOO_LARGE',
          message: `${row.fileName} exceeds the ${MAX_MARKDOWN_TEXT_BYTES}-byte viewer limit`
        }
      }

      try {
        return { ok: true, content: await storage.readTextFile(row.storedPath) }
      } catch (error) {
        log.error(`attachmentService.readAttachmentText failed for attachment ${id}`, error)
        return { ok: false, code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Unknown error' }
      }
    },

    async updateAttachmentText(id, content) {
      const row = repository.get(id)
      if (!row) {
        return { ok: false, code: 'ATTACHMENT_NOT_FOUND', message: `No attachment with id ${id}` }
      }
      if (!isMarkdownFileName(row.fileName)) {
        return { ok: false, code: 'NOT_MARKDOWN', message: `${row.fileName} is not a .md file` }
      }

      // Byte length, not character length — the zod cap at the bridge counts
      // characters, so multibyte content can be over the BYTE cap at a legal
      // character count. This is the authoritative check.
      const sizeBytes = Buffer.byteLength(content, 'utf8')
      if (sizeBytes > MAX_MARKDOWN_TEXT_BYTES) {
        return {
          ok: false,
          code: 'FILE_TOO_LARGE',
          message: `${row.fileName} exceeds the ${MAX_MARKDOWN_TEXT_BYTES}-byte viewer limit`
        }
      }

      // Reuses `writeIntoSubjectDir` with the row's EXISTING stored file name
      // — same directory, same name, so this overwrites in place rather than
      // minting a second stored file.
      try {
        await storage.writeIntoSubjectDir(row.subjectId, path.basename(row.storedPath), content)
      } catch (error) {
        log.error(`attachmentService.updateAttachmentText failed for attachment ${id}`, error)
        return { ok: false, code: 'WRITE_FAILED', message: error instanceof Error ? error.message : 'Unknown error' }
      }

      // The row may have been deleted between the get above and this update
      // (the delete handler commits rows first) — treat it as not-found, the
      // rewritten file will be cleaned with the rest of the subject dir.
      const updated = repository.update(id, { sizeBytes, indexStatus: 'pending' })
      if (!updated) {
        return { ok: false, code: 'ATTACHMENT_NOT_FOUND', message: `No attachment with id ${id}` }
      }

      // Same push seam as the indexing pipeline: the badge flip to
      // 'Pendiente' reaches every open window immediately.
      notifyStatusChanged(row.subjectId)
      // Fire-and-forget, same convention as the add paths above; the
      // indexer's `replaceChunks` makes the re-index idempotent.
      indexer.enqueue({
        attachmentId: row.id,
        subjectId: row.subjectId,
        storedPath: row.storedPath,
        fileName: row.fileName
      })
      return { ok: true, attachment: updated }
    }
  }
}
