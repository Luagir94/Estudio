// SQLite adapter for `classNoteBackfill.ts` — the only place that still reads
// or writes the legacy `class_notes` table.
//
// The table is deliberately NOT dropped by a migration: dropping it in the
// same release that moves its contents would leave a failed migration with
// nowhere to retry from. It drains instead, row by row, as each apunte lands
// safely in an attachment.
import { and, eq, isNotNull } from 'drizzle-orm'
import type { AppDatabase } from '../../db/connection'
import { attachments, classNotes } from '../../db/schema'
import type { ClassNoteBackfillPorts } from '../classNoteBackfill'

/**
 * Wires the backfill to the database, with the actual apunte WRITE injected —
 * that one belongs to `attachmentService` (a file, a preview, an FTS
 * re-index), and this adapter has no business reimplementing it.
 */
export function createSqliteClassNoteBackfillPorts(
  db: AppDatabase,
  saveApunte: (subjectId: number, classDate: string, content: string) => Promise<{ ok: boolean }>
): ClassNoteBackfillPorts {
  return {
    listLegacyNotes() {
      return db
        .select()
        .from(classNotes)
        .all()
        .map((row) => ({ subjectId: row.subjectId, date: row.date, body: row.body }))
    },
    hasApunte(subjectId, classDate) {
      const existing = db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.subjectId, subjectId),
            eq(attachments.classDate, classDate),
            isNotNull(attachments.classDate)
          )
        )
        .get()
      return existing !== undefined
    },
    saveApunte,
    dropLegacyNote(subjectId, classDate) {
      db.delete(classNotes)
        .where(and(eq(classNotes.subjectId, subjectId), eq(classNotes.date, classDate)))
        .run()
    }
  }
}
