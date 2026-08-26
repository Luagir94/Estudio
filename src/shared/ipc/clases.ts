// Shared IPC contract for the `clases:*` channels.
//
// A "clase" here is not a stored row — it is the pair `(subjectId, date)`.
// Nothing in this app materializes dated class sessions: `schedule_slots` is
// a weekly RECURRENCE PATTERN whose rows have no independent lifecycle (they
// are replaced wholesale by every `materias:updateSchedule`), so anything
// anchored to a slot id would be cascade-deleted the first time the student
// edits their horario. The full rationale lives on the `attendance_records`
// table in `main/db/schema.ts`; what matters here is the consequence: every
// command below addresses a subject and a calendar DAY, and the concrete
// occurrence (time, aula) is resolved at READ time by crossing that date with
// the slots then in effect — the same composition the pure `projectWeek()` in
// `renderer/horario/domain/weekProjection.ts` already performs.
//
// There is deliberately NO `clases:list`: attendance marks and apuntes ride
// on the subject detail payload (`materias:detail`) and on `hoy:dashboard`,
// exactly the way `finals` and `parciales` travel. This module ships WRITES
// only.
//
// One mark and one apunte per clase (the approved modal's own footer: "Una
// marca y un apunte por clase") — enforced by a UNIQUE index on
// `(subject_id, date)`, which is why the two save commands are UPSERTS and
// the two clear commands are real deletes. An unmarked class is the ABSENCE
// of a row, never a fourth status.
//
// The record shapes themselves live in `./materias` (the subject detail
// payload carries them, and importing them from here would close a cycle).
import { z } from 'zod'
import { attendanceStatusSchema, ipcErr, ipcOk, type IpcResult, parsePayload } from './materias'

export { ipcErr, ipcOk, type IpcResult, parsePayload }

// Local calendar date, `YYYY-MM-DD`. A class is a DAY: the time of day lives
// in the weekly slot, so accepting a datetime here would invent a second,
// contradictory source for it.
//
// Validation messages are STABLE MACHINE KEYS, not prose — see the
// architecture note at the top of shared/ipc/materias.ts (this module stays
// framework-free the same way).
const classDateSchema = z
  .string({ error: 'date.required' })
  .min(1, 'date.required')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date.invalid')

const subjectIdSchema = z.number().int().positive()

// --- clases:setAttendance -------------------------------------------------

export const setAttendanceInputSchema = z.object({
  subjectId: subjectIdSchema,
  date: classDateSchema,
  status: attendanceStatusSchema
})

export type SetAttendanceInput = z.infer<typeof setAttendanceInputSchema>

// --- clases:clearAttendance / clases:deleteNote ---------------------------

// ONE payload shape for both clear commands, because both address exactly
// what a mark and an apunte are anchored by. Splitting it into two identical
// schemas would only create two things to keep in step.
export const classDayInputSchema = z.object({
  subjectId: subjectIdSchema,
  date: classDateSchema
})

export type ClassDayInput = z.infer<typeof classDayInputSchema>

// Echoes the pair that was cleared rather than an `id`: the caller never knew
// an id — it knows a subject and a day, and that is what it invalidates on.
export const classDayResultSchema = z.object({
  subjectId: z.number().int(),
  date: z.string()
})

export type ClassDayResult = z.infer<typeof classDayResultSchema>

/**
 * What `clases:saveNote` answers: the class, plus the id of the apunte it
 * wrote.
 *
 * The id is the whole reason this is not a plain `ClassDayResult` — the
 * caller's next move is to OPEN that apunte in the editor, and without the id
 * it would have to refetch the subject and hunt for the row by date. Still no
 * body: the apunte's text lives in a file, and echoing back what the caller
 * just sent would invent a second source of truth for it.
 */
export const saveClassNoteResultSchema = z.object({
  subjectId: z.number().int(),
  date: z.string(),
  /** The apunte's ATTACHMENT id — what `adjuntos:read`/`adjuntos:write` address. */
  apunteId: z.number().int()
})

export type SaveClassNoteResult = z.infer<typeof saveClassNoteResultSchema>

// --- clases:saveNote ------------------------------------------------------

/**
 * Same cap `subjects.notas` carries (shared/ipc/materias.ts's
 * `optionalNotesField`): generous enough for real notes, bounded against an
 * unbounded write. Exported so the textarea and its tests read the ONE number
 * instead of restating it.
 */
export const CLASS_NOTE_BODY_MAX_CHARS = 20000

export const saveClassNoteInputSchema = z.object({
  subjectId: subjectIdSchema,
  date: classDateSchema,
  // Trimmed and non-empty: an emptied apunte is a DELETED apunte
  // (`clases:deleteNote`), not a stored blank. That is what keeps "has an
  // apunte" a question the row's presence answers.
  body: z.string().trim().min(1, 'body.required').max(CLASS_NOTE_BODY_MAX_CHARS, 'body.tooLong')
})

export type SaveClassNoteInput = z.infer<typeof saveClassNoteInputSchema>
