// Shared IPC contract for the `fechas:*` channels. Imported by BOTH main
// (parses incoming payloads before executing) and renderer (parses responses
// before caching) — "one validation story, no new dependency", the same rule
// every other module in this directory follows.
//
// An administrative date belongs to a PROGRAM, not to a subject: an
// inscription window, a regularidad expiry, a trámite. Its lifecycle is its
// own (you add one, you correct it, you delete a mistake), so it gets its own
// command set rather than riding inside `carreras:*` — the same asymmetry
// Deadline has against ScheduleSlot.
//
// Because this module is shared with main, it MUST stay framework-free — no
// i18n instance here. Every explicit validation message below is a STABLE
// MACHINE KEY (e.g. `title.required`), not prose; the renderer translates it
// at the render site via the `validation` namespace.
import { z } from 'zod'
import { ipcErr, ipcOk, type IpcResult, parsePayload } from './materias'

export { ipcErr, ipcOk, type IpcResult, parsePayload }

// Calendar date, `YYYY-MM-DD` — no time, no offset. A trámite boundary is a
// whole day (same contract as `carreras.ts`'s period dates, never
// `entregas.ts`'s due moment).
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date.invalid')

// `<input type="date">` emits '' when cleared, which here means "single-day
// date" — a first-class state, not a validation failure.
const optionalEndDate = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  localDateSchema.nullable().default(null)
)

// --- the closed catalogue -------------------------------------------------

// The kinds a date may be saved as. Owned HERE and only here: `academic_dates.
// kind` is plain SQL text with no CHECK constraint and no enum table, exactly
// like `subjects.outcome`, `deadlines.type` and `finalExams.result` (see the
// rationale comment on the table in `main/db/schema.ts`).
//
// The kind is a LABEL — it classifies the row for the reader and derives
// nothing. Which date closes, and when, is answered by `startsOn`/`endsOn`
// alone, so adding a kind can never change how an existing date behaves.
export const academicDateKindSchema = z.enum([
  'inscripcionFinales',
  'inscripcionCursadas',
  'vencimientoRegularidad',
  'otro'
])

export type AcademicDateKind = z.infer<typeof academicDateKindSchema>

// --- fechas:create / fechas:update requests -------------------------------

// The fields a date is MADE of, shared by create and update so the two
// commands can never drift apart (same rule as carreras.ts's
// `periodFieldsSchema`).
const academicDateFieldsSchema = z.object({
  title: z.string().trim().min(1, 'title.required').max(200, 'title.tooLong'),
  kind: academicDateKindSchema,
  startsOn: localDateSchema,
  // NULL means a single-day date, not an open-ended one: there is no such
  // thing as a trámite that never closes.
  endsOn: optionalEndDate
})

// `>=`, not `>`: a one-day window ("del 1 al 1") is a thing a form can
// legitimately produce, and rejecting it would be refusing a date the user
// can plainly read off their institution's calendar. Only an end BEFORE the
// start is nonsense. (Contrast `createPeriodInputSchema`, whose `>` exists
// because a zero-length period holds no classes.)
function refineWindow(academicDate: { startsOn: string; endsOn: string | null }, ctx: z.RefinementCtx): void {
  if (academicDate.endsOn !== null && academicDate.endsOn < academicDate.startsOn) {
    ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'endsOn.beforeStart' })
  }
}

export const createAcademicDateInputSchema = academicDateFieldsSchema
  .extend({ programId: z.number().int().positive() })
  .superRefine(refineWindow)

export type CreateAcademicDateInput = z.infer<typeof createAcademicDateInputSchema>

// No `programId` here ON PURPOSE: a date never changes carrera. Moving one
// would be a different operation from "corregí la fecha", and not one this
// screen offers — the same rule `updatePeriodInputSchema` follows.
export const updateAcademicDateInputSchema = academicDateFieldsSchema
  .extend({ id: z.number().int().positive() })
  .superRefine(refineWindow)

export type UpdateAcademicDateInput = z.infer<typeof updateAcademicDateInputSchema>

// --- fechas:delete request ------------------------------------------------

export const academicDateIdInputSchema = z.object({ id: z.number().int().positive() })

export type AcademicDateIdInput = z.infer<typeof academicDateIdInputSchema>

// --- shared record shapes -------------------------------------------------

// The READ side keeps the closed set, unlike `periodRecordSchema.kind` (a
// plain string only because periods saved before the catalogue existed hold
// free text). This table is new: every row it will ever hold was written
// through the schemas above, so widening the read shape would buy nothing and
// cost the guarantee. Same precedent as `finalExamRecordSchema.result`.
export const academicDateRecordSchema = z.object({
  id: z.number().int(),
  programId: z.number().int(),
  title: z.string(),
  kind: academicDateKindSchema,
  startsOn: z.string(),
  /** `null` = a single-day date, not a window. */
  endsOn: z.string().nullable()
})

export type AcademicDateRecord = z.infer<typeof academicDateRecordSchema>

// Enriched with the carrera's name at the repository layer (a join, not a
// second round-trip): Hoy's callout and the Entregas row both name the
// carrera, and neither has a program payload of its own to read it from.
//
// The COLOR is deliberately absent. A trámite belongs to a carrera, and the
// Entregas row prints "{carrera} · Trámite" with NO colour dot — the dot in
// that row means "materia", and borrowing it here would say something false.
export const academicDateWithProgramSchema = academicDateRecordSchema.extend({
  programName: z.string()
})

export type AcademicDateWithProgram = z.infer<typeof academicDateWithProgramSchema>

// --- fechas:list result ---------------------------------------------------

// ONE list across every carrera, flat and unfiltered — not pre-bucketed and
// not scoped to a program. Three surfaces read it (the carrera card filters
// by program, Hoy picks the most urgent, Entregas groups by urgency), and all
// three of those are "now"-dependent rendering-time questions the renderer
// domain answers (`renderer/fechas/domain/academicDate.ts`), the same
// precedent as `listDeadlinesResultSchema`.
export const listAcademicDatesResultSchema = z.array(academicDateWithProgramSchema)

// --- fechas:delete result -------------------------------------------------

export const deleteAcademicDateResultSchema = z.object({ id: z.number().int() })

export type DeleteAcademicDateResult = z.infer<typeof deleteAcademicDateResultSchema>
