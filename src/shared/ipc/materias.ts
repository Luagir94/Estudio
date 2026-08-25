// Shared IPC contract for the `materias:*` channels (design §2). Imported
// by BOTH main (parses incoming payloads before executing) and renderer
// (parses responses before caching) — "one validation story, no new
// dependency" per the design's decisions table.
//
// Because this module is shared with main, it MUST stay framework-free —
// no i18n instance here. Every explicit validation message below is
// therefore a STABLE MACHINE KEY (e.g. `name.required`), not prose. The
// renderer translates the key at the render site, via the `validation`
// i18next namespace (see `renderer/shared/lib/translateValidationMessage.ts`)
// — that is the only place the user actually sees it.
import { z } from 'zod'
import { deadlineRecordSchema } from './deadlines'

// --- materias:create request -----------------------------------------

// Slots have no independent lifecycle (design §2, §4): they only ever move
// as part of a `materias:create`/`materias:updateSchedule` payload.
export const scheduleSlotInputSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinutes: z.number().int().min(0).max(1439),
    endMinutes: z.number().int().min(0).max(1439),
    location: z.string().trim().min(1).max(200).nullable().default(null)
  })
  .refine((slot) => slot.endMinutes > slot.startMinutes, {
    message: 'slots.endBeforeStart',
    path: ['endMinutes']
  })

export type ScheduleSlotInput = z.infer<typeof scheduleSlotInputSchema>

// An empty string is treated the same as "not provided" — HTML text
// inputs emit '' rather than undefined when left blank, and the spec's
// "Create subject with only required fields" scenario must succeed when
// docente/contacto are left blank in the form.
const optionalTextField = z.preprocess(
  (value) => (value === '' ? undefined : value),
  // 2000 comfortably fits docente/contacto AND a campusUrl (URLs are the
  // longest thing this field carries); the cap only bounds a runaway blob.
  z.string().trim().min(1).max(2000).nullable().optional()
)

// docente/contacto are captured at creation time; campusUrl/notas are
// edit-form-only (spec: "Subject Field Set") and are not part of this
// command's payload — they land with the slice 2b update command.
// HTML selects emit strings; an empty option means "no period yet", which is
// a legitimate state (a subject can exist before its period is defined).
//
// `.optional()` rather than `.default(null)`: a default would make the field
// REQUIRED in the inferred output type, forcing every existing caller to
// pass it — same shape as attendanceMinPercent above.
const optionalPeriodId = z.preprocess((value) => {
  if (value === '' || value === null) {
    return null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}, z.number().int().positive().nullable().optional())

// REQUIRED on creation, unlike everywhere else this field appears.
//
// A subject with no period is a half-subject: it belongs to no carrera, its
// status can never leave "cursando" (there is no end date to pass), it can
// carry no grade, and no average counts it. Letting one be born that way
// would be shipping a trap that looks like a normal row.
//
// The COLUMN stays nullable, because a subject can legitimately BECOME
// orphaned later — deleting a period sets it null rather than destroying the
// work recorded under it. Being born without one and being widowed are
// different things, and only the first is forbidden.
const requiredPeriodId = z.preprocess(
  (value) => (typeof value === 'string' && value !== '' ? Number(value) : value),
  z.number({ error: 'periodId.required' }).int().positive()
)

export const createSubjectInputSchema = z.object({
  name: z.string().trim().min(1, 'name.required').max(200, 'name.tooLong'),
  code: z.string().trim().min(1, 'code.required').max(200, 'code.tooLong'),
  color: z.string().trim().min(1, 'color.required').max(200, 'color.tooLong'),
  docente: optionalTextField,
  contacto: optionalTextField,
  periodId: requiredPeriodId,
  slots: z.array(scheduleSlotInputSchema).min(1, 'slots.required')
})

export type CreateSubjectInput = z.infer<typeof createSubjectInputSchema>

// --- materias:updateSchedule request -----------------------------------

// campusUrl/notas are edit-form-only (spec: "Subject Field Set" — "accrue
// later"), so they only appear here, never in createSubjectInputSchema.
// Same empty-string-as-not-provided treatment as docente/contacto (HTML
// inputs/textareas emit '' rather than undefined when left blank).
const optionalNotesField = z.preprocess(
  (value) => (value === '' ? undefined : value),
  // Notas is the app's one long-form field, so its cap is generous (20k
  // chars) — enough for real notes, bounded against an unbounded write.
  z.string().max(20000).nullable().optional()
)

// HTML number inputs emit a string ('' when empty). Convert '' to null and
// numeric strings to actual numbers BEFORE validation — z.coerce.number()
// alone would coerce null itself into 0 (Number(null) === 0), so the empty
// check must happen first, in this preprocess.
const optionalAttendanceMinPercent = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}, z.number().min(0).max(100).nullable().optional())

// The condición de cursada the CÁTEDRA granted. Closed set, owned here and
// nowhere else — the column is plain text (see db/schema.ts).
//
// It is STORED, never derived: no arrangement of parciales, notas or
// asistencia may produce it, because every cátedra writes its own rules
// (promoción con 7, con 8, con asistencia, sin ella). The app records the
// faculty's verdict and reports it; it does not legislate it. `null` = not
// declared yet.
//
// Declared HERE, above the update payload that carries it, rather than down
// with the record shapes: these are plain `const`s, so a schema referencing
// one before its initialiser runs throws at module load (the same ordering
// hazard `subjectDetailSchema` documents at the bottom of this file).
export const subjectRegularitySchema = z.enum(['regular', 'promocionada', 'libre'])

export type SubjectRegularity = z.infer<typeof subjectRegularitySchema>

// No separate "update general fields" command exists in this slice's task
// list (only materias:create and materias:updateSchedule are scoped) — the
// "Editar materia" modal's 2 tabs (General + Horario) submit as ONE atomic
// write of the whole aggregate: general fields AND a full slot-set replace,
// matching "Subject remains the AGGREGATE ROOT" (see apply-progress
// Deviations for the explicit rationale).
export const updateSubjectScheduleInputSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1, 'name.required').max(200, 'name.tooLong'),
  code: z.string().trim().min(1, 'code.required').max(200, 'code.tooLong'),
  color: z.string().trim().min(1, 'color.required').max(200, 'color.tooLong'),
  docente: optionalTextField,
  contacto: optionalTextField,
  // Ficha de cátedra (comisión/aula/grupo): edit-form-only like campusUrl,
  // same optionalTextField contract as docente/contacto. groupUrl carries NO
  // schema-level URL check ON PURPOSE — exact parity with campusUrl, whose
  // enforced control is main's https-only allowlist at open time
  // (app/campusUrlValidator.ts), not this payload.
  comision: optionalTextField,
  aula: optionalTextField,
  campusUrl: optionalTextField,
  groupUrl: optionalTextField,
  notas: optionalNotesField,
  attendanceMinPercent: optionalAttendanceMinPercent,
  // The condición rides on the SUBJECT's own update payload rather than on a
  // `parciales:*` command, because it is a subject column and no parcial
  // decides it (see subjectRegularitySchema).
  //
  // `.optional()` here is load-bearing and NOT the same thing as
  // `attendanceMinPercent`'s: no editing surface ships for this field yet, so
  // the "Editar materia" form does not send it at all. ABSENT must therefore
  // stay distinguishable from an explicit `null`, or the first save of an
  // unrelated field would silently erase a recorded condición. The repository
  // writes this column ONLY when the key is present.
  regularity: subjectRegularitySchema.nullable().optional(),
  periodId: optionalPeriodId,
  slots: z.array(scheduleSlotInputSchema).min(1, 'slots.required')
})

export type UpdateSubjectScheduleInput = z.infer<typeof updateSubjectScheduleInputSchema>

// --- materias:detail / materias:delete requests -------------------------

export const subjectIdInputSchema = z.object({ id: z.number().int().positive() })

export type SubjectIdInput = z.infer<typeof subjectIdInputSchema>

// --- shared record shapes (materias:create response, materias:list) ----

export const scheduleSlotRecordSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  dayOfWeek: z.number().int(),
  startMinutes: z.number().int(),
  endMinutes: z.number().int(),
  location: z.string().nullable()
})

export type ScheduleSlotRecord = z.infer<typeof scheduleSlotRecordSchema>

export const subjectOutcomeSchema = z.enum(['aprobada', 'reprobada', 'finalPendiente'])

export type SubjectOutcome = z.infer<typeof subjectOutcomeSchema>

export const subjectRecordSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  code: z.string(),
  color: z.string(),
  docente: z.string().nullable(),
  contacto: z.string().nullable(),
  /** Ficha de cátedra — commission/section code, e.g. "K2051". */
  comision: z.string().nullable(),
  /** Ficha de cátedra — classroom, e.g. "Lab 3 · Edificio B". */
  aula: z.string().nullable(),
  campusUrl: z.string().nullable(),
  /** Link to the class chat group (WhatsApp/Discord/Telegram invite). */
  groupUrl: z.string().nullable(),
  notas: z.string().nullable(),
  attendanceMinPercent: z.number().nullable(),
  /** `null` for subjects that predate periods, or whose period was deleted. */
  periodId: z.number().int().nullable(),
  /** What the student decided. `null` = not decided yet. */
  outcome: subjectOutcomeSchema.nullable(),
  /** Only meaningful under a `numerico` program. */
  grade: z.number().nullable(),
  /** What the cátedra granted, recorded verbatim. `null` = not declared yet. */
  regularity: subjectRegularitySchema.nullable()
})

export type SubjectRecord = z.infer<typeof subjectRecordSchema>

export const subjectWithSlotsSchema = subjectRecordSchema.extend({
  slots: z.array(scheduleSlotRecordSchema)
})

export type SubjectWithSlots = z.infer<typeof subjectWithSlotsSchema>

// --- materias:delete result -----------------------------------------------

// The confirmation dialog's deadline count comes from the already-fetched
// materias:detail payload (deadlines.length) — no separate "count" IPC
// round-trip is needed. This result exists to confirm what was actually
// destroyed (spec: "Confirming deletion removes slots and deadlines
// everywhere").
export const deleteSubjectResultSchema = z.object({
  deletedSlots: z.number().int(),
  deletedDeadlines: z.number().int()
})

export type DeleteSubjectResult = z.infer<typeof deleteSubjectResultSchema>

// --- materias:list result ----------------------------------------------

// A PROJECTION of the period, not carreras' `periodRecordSchema`: importing
// that here would close a cycle (carreras.ts already imports this module's
// result envelope), and the Materias screen only needs the label plus the
// two dates its status depends on.
export const subjectPeriodSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  startsOn: z.string(),
  /** `null` = open-ended. */
  endsOn: z.string().nullable()
})

export type SubjectPeriod = z.infer<typeof subjectPeriodSchema>

export const finalExamResultSchema = z.enum(['pendiente', 'aprobado', 'reprobado'])

export type FinalExamResult = z.infer<typeof finalExamResultSchema>

// Declared HERE rather than in `shared/ipc/finales.ts` even though the
// `finales:*` commands own its lifecycle: the subject detail payload needs
// it, and finales.ts already imports this module's result envelope — putting
// it there would close an import cycle.
export const finalExamRecordSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  label: z.string(),
  /** `null` on purpose — you can record a mesa before its date is published. */
  takenOn: z.string().nullable(),
  result: finalExamResultSchema,
  /**
   * The nota of an APPROVED mesa under a `numerico` program. `null` on every
   * other result, on "aprobada sin nota", and always under `binario` — the
   * write rule lives in main's final-exam repository.
   */
  grade: z.number().nullable()
})

export type FinalExamRecord = z.infer<typeof finalExamRecordSchema>

export const partialExamResultSchema = z.enum(['pendiente', 'aprobado', 'reprobado'])

export type PartialExamResult = z.infer<typeof partialExamResultSchema>

// Declared HERE for exactly the reason `finalExamRecordSchema` is: the
// subject detail payload carries these rows, and `shared/ipc/parciales.ts`
// already imports this module's result envelope — declaring it there would
// close an import cycle.
export const partialExamRecordSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  label: z.string(),
  /** `null` on purpose — a parcial exists before the cátedra publishes its date. */
  takenOn: z.string().nullable(),
  result: partialExamResultSchema,
  /**
   * The nota the cátedra put on this parcial under a `numerico` program.
   * Unlike a mesa de final's, it is NOT approved-only: a reprobado 3 is the
   * number on the acta. `null` is "aprobado sin nota" and the only value
   * under `binario`.
   */
  grade: z.number().nullable()
})

export type PartialExamRecord = z.infer<typeof partialExamRecordSchema>

// The closed set of attendance marks, owned HERE and nowhere else — the
// column is plain text (see db/schema.ts). `feriado` is not a third way of
// missing a class: it says the class did not happen, which is why the
// percentage excludes it from BOTH sides of the ratio
// (renderer/clases/domain/attendance.ts).
//
// Declared in this module rather than in `shared/ipc/clases.ts` for exactly
// the reason `finalExamRecordSchema` and `partialExamRecordSchema` are: the
// subject detail payload carries these rows, and clases.ts already imports
// this module's result envelope — declaring them there would close an import
// cycle.
export const attendanceStatusSchema = z.enum(['presente', 'ausente', 'feriado'])

export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>

// One mark for one class, identified by `(subjectId, date)` — never by a
// slot. See `attendance_records`' comment in db/schema.ts for why that anchor
// is the whole design: schedule slots are a weekly pattern with no
// independent lifecycle, so a mark hanging off one would not survive the
// student editing their horario.
export const attendanceRecordSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  /** Local calendar date, `YYYY-MM-DD` — the DAY the class was. */
  date: z.string(),
  status: attendanceStatusSchema
})

export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>

// One plain-text apunte for one class, on the same `(subjectId, date)` anchor
// and with the same plain-text contract as `subjects.notas`. Deliberately not
// indexed for Ask — apuntes are stored and displayed, nothing more.
export const classNoteRecordSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  date: z.string(),
  body: z.string()
})

export type ClassNoteRecord = z.infer<typeof classNoteRecordSchema>

// Everything `resolveSubjectStatus` needs, and nothing more. The status
// itself is NOT computed here: it depends on "today", which is a
// rendering-time concern (same rule as the deadline buckets — baking it into
// a cached payload would go stale between renders).
// Reached THROUGH the period. It rides along because closing a subject has
// to know whether its program grades at all — asking for a nota under a
// pass/fail program is a question with no valid answer.
export const subjectProgramSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  gradingScheme: z.enum(['numerico', 'binario']),
  gradeScale: z.number().int().nullable()
})

export type SubjectProgram = z.infer<typeof subjectProgramSchema>

export const subjectWithStatusSchema = subjectWithSlotsSchema.extend({
  period: subjectPeriodSchema.nullable(),
  program: subjectProgramSchema.nullable(),
  finals: z.array(z.object({ result: finalExamResultSchema })),
  /**
   * Open (not done) deadlines. A COUNT rather than the rows: the list only
   * ever shows the number, and shipping every deadline of every subject to
   * render one integer would be paying for data nobody reads.
   *
   * Unlike the status, this needs no "now" — a deadline is open or done,
   * regardless of the date — so main can safely compute it.
   */
  pendingDeadlines: z.number().int()
})

export type SubjectWithStatus = z.infer<typeof subjectWithStatusSchema>

export const listSubjectsResultSchema = z.array(subjectWithStatusSchema)

// --- materias:detail result ----------------------------------------------

// Declared AFTER the period/program/final schemas it composes: these are
// plain `const`s, so referencing one before its initialiser runs would throw
// at module load, not fail at compile time.
//
// Aggregates subject + slots + deadlines + period + program + finals.
// Deriving próxima clase / progreso / estado from this happens in the pure
// renderer domain layer at render time, never baked into this payload —
// "now" is a rendering-time concern and would go stale in the TanStack Query
// cache between renders.
export const subjectDetailSchema = subjectWithSlotsSchema.extend({
  deadlines: z.array(deadlineRecordSchema),
  period: subjectPeriodSchema.nullable(),
  program: subjectProgramSchema.nullable(),
  // FULL records here, unlike the list's `{ result }` projection: the detail
  // screen edits these rows, so it needs their ids, labels and dates.
  finals: z.array(finalExamRecordSchema),
  // Parciales join the SUBJECT READ rather than getting a `parciales:list`
  // channel of their own — exactly how `finals` travels. The only screen that
  // shows them is this one, and it already fetches the subject.
  parciales: z.array(partialExamRecordSchema),
  // Attendance marks and class apuntes travel the same way, for the same
  // reason: `clases:*` ships WRITE channels only, and no read path of its own
  // exists. The whole history rides here because the ASISTENCIA card
  // summarizes all of it and the APUNTES DE CLASE section lists all of it —
  // this is not a projection that could be narrowed to "recent".
  attendance: z.array(attendanceRecordSchema),
  classNotes: z.array(classNoteRecordSchema)
})

export type SubjectDetailResult = z.infer<typeof subjectDetailSchema>

// --- materias:setOutcome request ------------------------------------------

// Closing a subject is its own command rather than part of
// `materias:updateSchedule`: that one is the aggregate-root write for the
// subject's *definition*, while this records an OUTCOME, which the student
// may set long after the definition stopped changing.
//
// `grade` is validated against the owning program's scheme in main
// (shared/domain/grading.ts) — the payload alone cannot know the scheme.
export const setSubjectOutcomeInputSchema = z.object({
  id: z.number().int().positive(),
  outcome: subjectOutcomeSchema.nullable(),
  grade: z.preprocess((value) => {
    if (value === '' || value === undefined || value === null) {
      return null
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      return Number.isNaN(parsed) ? value : parsed
    }
    return value
  }, z.number().nullable().default(null))
})

export type SetSubjectOutcomeInput = z.infer<typeof setSubjectOutcomeInputSchema>

// --- result envelope -----------------------------------------------------

// `ipcRenderer.invoke(channel, payload) → { ok: true, data } | { ok: false,
// error }`. No throws across the bridge (design §2).
export const ipcErrorSchema = z.object({
  code: z.string(),
  message: z.string()
})

export type IpcError = z.infer<typeof ipcErrorSchema>

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

export function ipcOk<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export function ipcErr(code: string, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } }
}

export type ParsePayloadResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly failure: IpcResult<never> }

/**
 * Parses an IPC payload against its schema and, on failure, builds the exact
 * error envelope every handler used to assemble inline: the issue messages
 * (stable machine keys, see the note above the schemas) joined with '; '
 * under a `VALIDATION_ERROR` code. Handlers early-return `failure` and get
 * the PARSED (transformed/defaulted) payload from `data` otherwise.
 */
export function parsePayload<Schema extends z.ZodType>(
  schema: Schema,
  payload: unknown,
  code = 'VALIDATION_ERROR'
): ParsePayloadResult<z.output<Schema>> {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, failure: ipcErr(code, parsed.error.issues.map((issue) => issue.message).join('; ')) }
  }
  return { ok: true, data: parsed.data }
}
