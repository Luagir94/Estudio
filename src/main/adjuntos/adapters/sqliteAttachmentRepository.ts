import { asc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../db/connection'
import { attachments } from '../../db/schema'
import { InvalidIndexStatusError, isIndexStatus, type IndexStatus } from '../../indexado/domain/indexStatus'

export interface AttachmentRecord {
  id: number
  subjectId: number
  fileName: string
  storedPath: string
  mimeType: string | null
  sizeBytes: number
  title: string | null
  createdAt: string
  // Defaults to 'pending' at the column level (migration 0006,
  // attachment-fts-index spec "New attachment starts pending") — this
  // repository never writes it, only reads it back through `.returning()`/
  // `.select()`, which already includes every column of the row.
  indexStatus: IndexStatus
}

export interface CreateAttachmentInput {
  subjectId: number
  fileName: string
  storedPath: string
  mimeType: string | null
  sizeBytes: number
  title: string | null
  createdAt: string
}

export interface AttachmentRepository {
  /** Ordered by `createdAt` ASCENDING (spec: "List Attachments"). */
  listBySubject(subjectId: number): AttachmentRecord[]
  /** Null if not found. */
  get(id: number): AttachmentRecord | null
  insert(input: CreateAttachmentInput): AttachmentRecord
  /** The deleted row, or `undefined` if no row with that id existed. */
  remove(id: number): AttachmentRecord | undefined
}

/** SQLite has no enums; an unrecognised `index_status` means the row was written by something other than the validated command path (indexStatus.ts's closed set) — corruption worth failing on, same convention as `sqliteSubjectRepository.ts`'s `toOutcome`. */
function toRecord(row: typeof attachments.$inferSelect): AttachmentRecord {
  if (!isIndexStatus(row.indexStatus)) {
    throw new InvalidIndexStatusError(row.indexStatus)
  }
  return { ...row, indexStatus: row.indexStatus }
}

/**
 * SQLite-backed implementation of the attachment-registry port (design
 * "Data Model (PR1)"). Deliberately thin — no path resolution, no fs
 * access, no size-cap enforcement. Those belong to `attachmentPaths.ts`,
 * `attachmentService.ts` (PR2), and `limits.ts` respectively; this
 * repository only ever reads and writes the `attachments` TABLE. Subject
 * deletion cascade is pure FK (`ON DELETE CASCADE` + `PRAGMA foreign_keys =
 * ON`, see connection.ts) — this file does not implement cascade itself.
 */
export function createSqliteAttachmentRepository(db: AppDatabase): AttachmentRepository {
  return {
    listBySubject(subjectId) {
      return db
        .select()
        .from(attachments)
        .where(eq(attachments.subjectId, subjectId))
        .orderBy(asc(attachments.createdAt))
        .all()
        .map(toRecord)
    },
    get(id) {
      const record = db.select().from(attachments).where(eq(attachments.id, id)).get()
      return record ? toRecord(record) : null
    },
    insert(input) {
      const record = db
        .insert(attachments)
        .values({
          subjectId: input.subjectId,
          fileName: input.fileName,
          storedPath: input.storedPath,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          title: input.title,
          createdAt: input.createdAt
        })
        .returning()
        .get()
      return toRecord(record)
    },
    remove(id) {
      const existing = db.select().from(attachments).where(eq(attachments.id, id)).get()
      if (!existing) {
        return undefined
      }
      db.delete(attachments).where(eq(attachments.id, id)).run()
      return toRecord(existing)
    }
  }
}
