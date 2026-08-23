import { asc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../db/connection'
import { attachments } from '../../db/schema'
import { InvalidIndexStatusError, isIndexStatus, type IndexStatus } from '../../indexado/domain/indexStatus'

// Closed set for `attachments.origin` (cli-generated-artifacts spec "Origin
// provenance column and badge") — same no-SQL-constraint convention as
// `IndexStatus`/`subjects.outcome`. 'user' is a normal upload; 'ai-generated'
// marks a row written by the ask-generated-artifacts save path.
export type AttachmentOrigin = 'user' | 'ai-generated'

function toOrigin(value: string): AttachmentOrigin {
  if (value !== 'user' && value !== 'ai-generated') {
    throw new Error(`Unknown attachment origin "${value}"`)
  }
  return value
}

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
  // Defaults to 'user' at the column level (migration 0008,
  // cli-generated-artifacts spec "Pre-existing rows migrate to 'user' by
  // default").
  origin: AttachmentOrigin
}

export interface CreateAttachmentInput {
  subjectId: number
  fileName: string
  storedPath: string
  mimeType: string | null
  sizeBytes: number
  title: string | null
  createdAt: string
  // REQUIRED, not defaulted here (cli-generated-artifacts design "Module
  // Layout"): every call site must say explicitly whether it is writing a
  // user upload or an ai-generated artifact — a compile error is the point,
  // not an oversight.
  origin: AttachmentOrigin
}

/**
 * The ONLY two columns the markdown save path may touch
 * (markdown-attachment-viewer): the rewritten file's byte size, and the
 * index status dropping back to 'pending' so the re-index is visible.
 * Deliberately not a general-purpose patch — fileName/storedPath/origin
 * stay immutable through this repository.
 */
export interface UpdateAttachmentInput {
  sizeBytes: number
  indexStatus: IndexStatus
}

export interface AttachmentRepository {
  /** Ordered by `createdAt` ASCENDING (spec: "List Attachments"). */
  listBySubject(subjectId: number): AttachmentRecord[]
  /** Null if not found. */
  get(id: number): AttachmentRecord | null
  insert(input: CreateAttachmentInput): AttachmentRecord
  /** The updated row, or `undefined` if no row with that id existed. */
  update(id: number, input: UpdateAttachmentInput): AttachmentRecord | undefined
  /** The deleted row, or `undefined` if no row with that id existed. */
  remove(id: number): AttachmentRecord | undefined
}

/** SQLite has no enums; an unrecognised `index_status` means the row was written by something other than the validated command path (indexStatus.ts's closed set) — corruption worth failing on, same convention as `sqliteSubjectRepository.ts`'s `toOutcome`. */
function toRecord(row: typeof attachments.$inferSelect): AttachmentRecord {
  if (!isIndexStatus(row.indexStatus)) {
    throw new InvalidIndexStatusError(row.indexStatus)
  }
  return { ...row, indexStatus: row.indexStatus, origin: toOrigin(row.origin) }
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
          createdAt: input.createdAt,
          origin: input.origin
        })
        .returning()
        .get()
      return toRecord(record)
    },
    update(id, input) {
      const record = db
        .update(attachments)
        .set({ sizeBytes: input.sizeBytes, indexStatus: input.indexStatus })
        .where(eq(attachments.id, id))
        .returning()
        .get()
      return record ? toRecord(record) : undefined
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
