import { and, desc, eq, isNotNull } from 'drizzle-orm'
import type { ClassDayInput, SetAttendanceInput } from '../../../shared/ipc/clases'
import type { AttendanceRecord, AttendanceStatus, ClassNoteRecord } from '../../../shared/ipc/materias'
import type { AppDatabase } from '../../db/connection'
import { attachments, attendanceRecords } from '../../db/schema'

/**
 * The write port for one class, addressed as `(subjectId, date)`.
 *
 * There is no `create`/`update` pair here and there never will be: the UNIQUE
 * index on `(subject_id, date)` says one mark and one apunte per class, so
 * the only honest write is an UPSERT. Callers do not know whether a mark
 * already exists — they know what the class was — and asking them to find out
 * first would be inventing a race for no reason.
 *
 * The two `list*` pairs exist because two screens read this data through two
 * different payloads: `listAttendanceBySubject`/`listNotesBySubject` feed
 * `materias:detail`, `listAttendance`/`listNotes` feed `hoy:dashboard`.
 * Neither filters by date — "today" is a rendering-time concern and baking it
 * into a cached payload would go stale at midnight (the same rule
 * `hoy.ts`/`materias.ts` already state about every derived value).
 */
export interface ClaseRepository {
  /** Records or corrects the mark for one class. Returns the stored row either way. */
  setAttendance(input: SetAttendanceInput): AttendanceRecord
  /** Back to UNMARKED — the absence of a row, not a fourth status. False if there was nothing to clear. */
  clearAttendance(input: ClassDayInput): boolean
  listAttendanceBySubject(subjectId: number): AttendanceRecord[]
  listAttendance(): AttendanceRecord[]
  /**
   * The apuntes of one subject, newest class first.
   *
   * READ ONLY, and that asymmetry is deliberate: an apunte is a markdown
   * ATTACHMENT, so its writes belong to `attachmentService` (which owns the
   * file, the preview and the FTS re-index) and there is no `saveNote` here
   * to let a second write path exist. These two readers stay in the clases
   * slice because the two payloads that carry apuntes — `materias:detail` and
   * `hoy:dashboard` — are assembled beside the marks they travel with.
   */
  listNotesBySubject(subjectId: number): ClassNoteRecord[]
  listNotes(): ClassNoteRecord[]
}

/**
 * An apunte row, projected out of the attachment it actually is.
 *
 * `title` carries the preview (see `UpdateAttachmentInput`) and is nullable at
 * the column level, so an apunte written before it had one — or by a path
 * that forgot — degrades to an empty preview rather than crashing a list. The
 * apunte itself is never lost: the file is the apunte, this is only its label.
 */
function toClassNoteRecord(row: {
  id: number
  subjectId: number
  classDate: string | null
  title: string | null
}): ClassNoteRecord {
  return { id: row.id, subjectId: row.subjectId, date: row.classDate ?? '', preview: row.title ?? '' }
}

const STATUSES = new Set(['presente', 'ausente', 'feriado'])

// SQLite has no enums; an unrecognised value means the row was written by
// something other than the validated commands, which is corruption worth
// failing on rather than coercing into a valid-looking state. Same guard
// sqlitePartialExamRepository applies to `partial_exams.result`.
export function toAttendanceRecord(row: {
  id: number
  subjectId: number
  date: string
  status: string
}): AttendanceRecord {
  if (!STATUSES.has(row.status)) {
    throw new Error(`Unknown attendance status "${row.status}"`)
  }
  return { ...row, status: row.status as AttendanceStatus }
}

/**
 * SQLite-backed implementation of the clase port.
 *
 * Note what is NOT here, and never will be: any write to `schedule_slots`,
 * and any row that names a slot. A mark belongs to a subject and a day; which
 * slot that day happened to fall on is a question the weekly pattern answers
 * at read time, and storing the answer would make an edited horario silently
 * destroy the record of a cursada.
 *
 * Note also what does not happen on a write: nothing here touches
 * `subjects.attendanceMinPercent`, `subjects.regularity` or
 * `subjects.outcome`. The percentage is DERIVED from these rows at render
 * time (renderer/clases/domain/attendance.ts); the minimum is what the
 * cátedra requires and the condición is what it granted. Recording that you
 * were in class is a fact — what it earns you is the faculty's call.
 */
export function createSqliteClaseRepository(db: AppDatabase): ClaseRepository {
  return {
    setAttendance(input) {
      return toAttendanceRecord(
        db
          .insert(attendanceRecords)
          .values({ subjectId: input.subjectId, date: input.date, status: input.status })
          // The upsert rides the SAME unique index the contract is stated on,
          // so the "one mark per class" rule is enforced by the database, not
          // by a read-then-write in application code that a second window
          // could interleave with.
          .onConflictDoUpdate({
            target: [attendanceRecords.subjectId, attendanceRecords.date],
            set: { status: input.status }
          })
          .returning()
          .get()
      )
    },
    clearAttendance(input) {
      const removed = db
        .delete(attendanceRecords)
        .where(and(eq(attendanceRecords.subjectId, input.subjectId), eq(attendanceRecords.date, input.date)))
        .returning()
        .all()
      return removed.length > 0
    },
    listAttendanceBySubject(subjectId) {
      return db
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.subjectId, subjectId))
        .all()
        .map(toAttendanceRecord)
    },
    listAttendance() {
      return db.select().from(attendanceRecords).all().map(toAttendanceRecord)
    },
    listNotesBySubject(subjectId) {
      return db
        .select()
        .from(attachments)
        .where(and(eq(attachments.subjectId, subjectId), isNotNull(attachments.classDate)))
        .orderBy(desc(attachments.classDate))
        .all()
        .map(toClassNoteRecord)
    },
    listNotes() {
      return db
        .select()
        .from(attachments)
        .where(isNotNull(attachments.classDate))
        .orderBy(desc(attachments.classDate))
        .all()
        .map(toClassNoteRecord)
    }
  }
}
