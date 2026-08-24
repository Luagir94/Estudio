// Shared IPC contract for the `carreras:*` channels (design §2). Imported by
// BOTH main (parses incoming payloads before executing) and renderer (parses
// responses before caching) — "one validation story, no new dependency".
//
// The shapes here deliberately mirror renderer/carreras/domain/{program,
// period}.ts rather than importing them: `shared/ipc` is imported by main,
// and main must not reach into a renderer slice. Same precedent as
// shared/ipc/materias.ts vs renderer/materias/domain/subject.ts.
//
// Validation messages are STABLE MACHINE KEYS, not prose — see the
// architecture note at the top of shared/ipc/materias.ts (this module stays
// framework-free the same way).
import { z } from 'zod'
import { ipcErr, ipcOk, type IpcResult } from './materias'

export { ipcErr, ipcOk, type IpcResult }

// Calendar date, `YYYY-MM-DD` — no time, no offset (a period boundary is a
// whole day, unlike a deadline's due moment).
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date.invalid')

// HTML text inputs emit '' rather than undefined when left blank (same
// treatment as materias.ts's docente/contacto).
const optionalTextField = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.string().trim().min(1).max(200).nullable().default(null)
)

// --- carreras:create request ---------------------------------------------

export const gradingSchemeSchema = z.enum(['numerico', 'binario'])

export type GradingScheme = z.infer<typeof gradingSchemeSchema>

// `gradeScale` is the TOP of the scale (10, 100, …) and is required exactly
// when the scheme is numeric — a pass/fail program has no scale to speak of.
//
// The fields a program is MADE of, shared by create and update so the two
// commands can never drift apart (same rule as periodFieldsSchema below).
const programFieldsSchema = z.object({
  name: z.string().trim().min(1, 'name.required').max(200, 'name.tooLong'),
  institution: optionalTextField,
  color: z.string().trim().min(1, 'color.required').max(200, 'color.tooLong'),
  gradingScheme: gradingSchemeSchema,
  gradeScale: z.number().int().min(2).max(100).nullable().default(null)
})

// Scheme and scale are one decision expressed in two fields, so neither
// command may accept a combination the other would reject.
function refineSchemeAndScale(
  program: { gradingScheme: GradingScheme; gradeScale: number | null },
  ctx: z.RefinementCtx
): void {
  if (program.gradingScheme === 'numerico' && program.gradeScale === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['gradeScale'],
      message: 'gradeScale.required'
    })
  }
  if (program.gradingScheme === 'binario' && program.gradeScale !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['gradeScale'],
      message: 'gradeScale.mustBeAbsent'
    })
  }
}

export const createProgramInputSchema = programFieldsSchema.superRefine(refineSchemeAndScale)

export type CreateProgramInput = z.infer<typeof createProgramInputSchema>

// --- carreras:update request ----------------------------------------------

// Same fields as create plus the id. The SCHEME AND SCALE ARE ACCEPTED HERE,
// but they are not always changeable: whether the program still has room to
// change them is a domain question about its recorded grades, answered by
// `hasRecordedEvaluations` in renderer/carreras/domain/program.ts and enforced
// by the screen, not by this shape.
//
// The transport stays permissive ON PURPOSE. Locking the fields in the schema
// would mean main deciding "has this carrera been graded yet?", and that is
// the same class of rule the gradedSubjects comment below refuses to move into
// main: main ships facts, the renderer applies the rule. A program with no
// grades must be able to send a corrected scale through this exact command.
export const updateProgramInputSchema = programFieldsSchema
  .extend({ id: z.number().int().positive() })
  .superRefine(refineSchemeAndScale)

export type UpdateProgramInput = z.infer<typeof updateProgramInputSchema>

// --- carreras:createPeriod / carreras:updatePeriod requests ---------------

// The kinds a period may be SAVED as — a closed catalogue, mirrored by
// renderer/carreras/domain/periodKind.ts (which owns the divisions-per-year
// and the names each kind derives; the two lists are held together by a test
// there). Duplicated rather than imported for the same reason as everything
// else in this file: main parses these payloads, and main must not reach into
// a renderer slice.
//
// This is a WRITE-SIDE rule only. `periodRecordSchema.kind` below stays a
// plain string on purpose: periods saved before the catalogue existed hold
// free text, and tightening the READ shape would make the carreras screen
// fail to parse its own data instead of showing it.
export const periodKindSchema = z.enum(['anual', 'cuatrimestre', 'trimestre', 'bimestre', 'mensual', 'curso'])

export type PeriodKindValue = z.infer<typeof periodKindSchema>

// The fields a period is MADE of, shared by create and update so the two
// commands can never drift apart (same rule as entregas.ts's
// `updateDeadlineInputSchema`: editing reuses the creation contract).
const periodFieldsSchema = z.object({
  name: z.string().trim().min(1, 'name.required').max(200, 'name.tooLong'),
  kind: periodKindSchema,
  startsOn: localDateSchema,
  // NULL means open-ended — "clases de inglés" that do not stop. The refines
  // below therefore only order the dates when there is an end to order.
  endsOn: localDateSchema.nullable().default(null)
})

export const createPeriodInputSchema = periodFieldsSchema
  .extend({ programId: z.number().int().positive() })
  .refine((period) => period.endsOn === null || period.endsOn > period.startsOn, {
    message: 'period.endBeforeStart',
    path: ['endsOn']
  })

export type CreatePeriodInput = z.infer<typeof createPeriodInputSchema>

// No `programId` here ON PURPOSE: a period never changes carrera. Its
// subjects reach their program THROUGH it, so moving one would silently drag
// every subject recorded under it into another carrera — a different
// operation from "corregí las fechas", and not one this screen offers.
export const updatePeriodInputSchema = periodFieldsSchema
  .extend({ id: z.number().int().positive() })
  .refine((period) => period.endsOn === null || period.endsOn > period.startsOn, {
    message: 'period.endBeforeStart',
    path: ['endsOn']
  })

export type UpdatePeriodInput = z.infer<typeof updatePeriodInputSchema>

// --- carreras:deletePeriod request ----------------------------------------

export const periodIdInputSchema = z.object({ id: z.number().int().positive() })

export type PeriodIdInput = z.infer<typeof periodIdInputSchema>

// --- carreras:detail / delete requests ------------------------------------

export const programIdInputSchema = z.object({ id: z.number().int().positive() })

export type ProgramIdInput = z.infer<typeof programIdInputSchema>

// --- shared record shapes -------------------------------------------------

export const programRecordSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  institution: z.string().nullable(),
  color: z.string(),
  gradingScheme: gradingSchemeSchema,
  gradeScale: z.number().int().nullable()
})

export type ProgramRecord = z.infer<typeof programRecordSchema>

export const periodRecordSchema = z.object({
  id: z.number().int(),
  programId: z.number().int(),
  name: z.string(),
  kind: z.string(),
  startsOn: z.string(),
  /** `null` = open-ended. */
  endsOn: z.string().nullable()
})

export type PeriodRecord = z.infer<typeof periodRecordSchema>

export const subjectOutcomeSchema = z.enum(['aprobada', 'reprobada', 'finalPendiente'])

export type SubjectOutcome = z.infer<typeof subjectOutcomeSchema>

// Just enough to feed carreras/domain/program.ts's calculateProgramAverage
// in the renderer.
//
// Note what is NOT here: a `passed` boolean. Whether a subject counts as
// passed is a DOMAIN RULE (materias/domain/subjectStatus.ts's `isPassed`),
// and resolving it in a SQL query would put a second copy of that rule in
// main, free to drift. Main ships facts — the grade, the recorded outcome,
// and whether an approved final row exists — and the renderer applies the
// rule. `hasApprovedFinal` is a plain data question about the rows, which is
// exactly what a repository is for.
export const gradedSubjectSchema = z.object({
  grade: z.number().nullable(),
  outcome: subjectOutcomeSchema.nullable(),
  hasApprovedFinal: z.boolean()
})

export type GradedSubjectRecord = z.infer<typeof gradedSubjectSchema>

export const programWithPeriodsSchema = programRecordSchema.extend({
  periods: z.array(periodRecordSchema),
  subjectCount: z.number().int(),
  gradedSubjects: z.array(gradedSubjectSchema)
})

export type ProgramWithPeriods = z.infer<typeof programWithPeriodsSchema>

export const listProgramsResultSchema = z.array(programWithPeriodsSchema)

// --- carreras:delete result ------------------------------------------------

// Deleting a program cascades to its periods (FK). Subjects are NOT deleted:
// their `period_id` is set to NULL, so the count is reported to be shown in
// the confirmation dialog rather than silently losing the link.
export const deleteProgramResultSchema = z.object({
  id: z.number().int(),
  deletedPeriods: z.number().int(),
  unlinkedSubjects: z.number().int()
})

export type DeleteProgramResult = z.infer<typeof deleteProgramResultSchema>

// --- carreras:deletePeriod result -------------------------------------------

// Same rule one level down: deleting a period does NOT delete the subjects
// recorded under it — their `period_id` falls back to NULL (schema.ts's
// `set null`). The count is reported so the confirmation dialog can say how
// many materias are about to be left sin período.
export const deletePeriodResultSchema = z.object({
  id: z.number().int(),
  unlinkedSubjects: z.number().int()
})

export type DeletePeriodResult = z.infer<typeof deletePeriodResultSchema>
