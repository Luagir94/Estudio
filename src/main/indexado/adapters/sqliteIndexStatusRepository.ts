import { eq, ne } from 'drizzle-orm'
import type { AppDatabase } from '../../db/connection'
import { attachments } from '../../db/schema'
import { InvalidIndexStatusError, isIndexStatus, type IndexStatus } from '../domain/indexStatus'

export interface AttachmentIndexRow {
  id: number
  subjectId: number
  fileName: string
  storedPath: string
  indexStatus: IndexStatus
}

export interface IndexStatusRepository {
  /**
   * Every attachment with `index_status != 'indexed'` — both `pending` and
   * `not-indexable` rows (design "Sync scope"), which is what makes
   * Sincronizar the v1 retry path (spec "Sincronizar picks up pre-existing
   * and stuck attachments").
   */
  listUnindexed(): AttachmentIndexRow[]
  /**
   * The row to index by id, or `null` if it no longer exists (design "Job
   * pipeline": "load row (skip if deleted)") — the row may have been
   * removed via `adjuntos:delete` between enqueue and this job actually
   * running, since the FIFO queue can be arbitrarily backed up.
   */
  get(attachmentId: number): AttachmentIndexRow | null
  /** No-op (zero rows affected) if the row no longer exists — mirrors `get`'s null case for a job that reached this far before a concurrent delete. */
  setStatus(attachmentId: number, status: IndexStatus): void
}

/** Validates the stored `index_status` against the closed set (domain "indexStatus") before it ever reaches a caller — a hand-edited/corrupted column value must never silently masquerade as a real status. */
function toRow(record: typeof attachments.$inferSelect): AttachmentIndexRow {
  if (!isIndexStatus(record.indexStatus)) {
    throw new InvalidIndexStatusError(record.indexStatus)
  }
  return {
    id: record.id,
    subjectId: record.subjectId,
    fileName: record.fileName,
    storedPath: record.storedPath,
    indexStatus: record.indexStatus
  }
}

/**
 * SQLite-backed implementation of the indexing status port (attachment-fts-
 * index design "Storage" / "Sync scope"). Typed drizzle over `attachments` —
 * unlike `sqliteChunkStore.ts`, nothing here touches the raw FTS5 table, so
 * the query builder is the right tool (same convention as
 * `sqliteAttachmentRepository.ts`).
 */
export function createSqliteIndexStatusRepository(db: AppDatabase): IndexStatusRepository {
  return {
    listUnindexed() {
      return db.select().from(attachments).where(ne(attachments.indexStatus, 'indexed')).all().map(toRow)
    },
    get(attachmentId) {
      const record = db.select().from(attachments).where(eq(attachments.id, attachmentId)).get()
      return record ? toRow(record) : null
    },
    setStatus(attachmentId, status) {
      db.update(attachments).set({ indexStatus: status }).where(eq(attachments.id, attachmentId)).run()
    }
  }
}
