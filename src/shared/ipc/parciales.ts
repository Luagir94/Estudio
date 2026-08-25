// Shared IPC contract for the `parciales:*` channels.
//
// PartialExam rows are cascade-deleted with their subject, but they have
// their OWN lifecycle — you add a parcial, you record how it went, you fix a
// wrong nota, you delete a mistake — so they get their own command set, the
// same asymmetry FinalExam and Deadline already have against ScheduleSlot.
//
// There is deliberately NO `parciales:list`: the rows ride on the subject
// detail payload (`materias:detail`), exactly the way `finals` does — the one
// screen that shows them has already fetched the subject.
//
// There is also deliberately no command here for the subject's `regularity`.
// It is a SUBJECT column and no parcial decides it, so it travels on
// `materias:updateSchedule` (see `subjectRegularitySchema` in ./materias).
//
// The record shape itself lives in `./materias` (the subject detail payload
// carries it, and importing it from here would close a cycle).
import { z } from 'zod'
import { ipcErr, ipcOk, type IpcResult, parsePayload, partialExamResultSchema } from './materias'

export { ipcErr, ipcOk, type IpcResult, parsePayload }

// Calendar date, `YYYY-MM-DD` — a parcial is a day, not a moment.
//
// Validation messages are STABLE MACHINE KEYS, not prose — see the
// architecture note at the top of shared/ipc/materias.ts (this module stays
// framework-free the same way).
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date.invalid')

// `<input type="date">` emits '' when cleared, which means "the cátedra has
// not published it yet" — a first-class state here, not a validation failure.
const optionalDate = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  localDateSchema.nullable()
)

// Same empty-string preprocess as finales.ts and materias.ts's
// setSubjectOutcomeInputSchema — HTML number inputs emit strings, '' when
// cleared — and the same division of labor: the payload alone cannot know the
// program's scheme, so the scheme/upper-bound rule runs in main
// (shared/domain/grading.ts).
//
// The ONE range check that does not need the program is the lower bound: no
// scheme in existence admits a negative nota, so it is caught here, at the
// boundary, under the `grade.outOfRange` key the renderer translates.
const optionalGrade = z.preprocess((value) => {
  if (value === '' || value === undefined || value === null) {
    return null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}, z.number().min(0, 'grade.outOfRange').nullable().default(null))

// Unlike a mesa de final, a parcial IS born with its result and its nota: the
// approved form records everything the acta says in one write, because a
// parcial is usually entered after it happened, not scheduled before it.
export const createPartialExamInputSchema = z.object({
  subjectId: z.number().int().positive(),
  label: z.string().trim().min(1, 'label.required').max(200, 'label.tooLong'),
  takenOn: optionalDate,
  result: partialExamResultSchema.default('pendiente'),
  grade: optionalGrade
})

export type CreatePartialExamInput = z.infer<typeof createPartialExamInputSchema>

export const updatePartialExamInputSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().trim().min(1, 'label.required').max(200, 'label.tooLong'),
  takenOn: optionalDate,
  result: partialExamResultSchema,
  grade: optionalGrade
})

export type UpdatePartialExamInput = z.infer<typeof updatePartialExamInputSchema>

export const partialExamIdInputSchema = z.object({ id: z.number().int().positive() })

export type PartialExamIdInput = z.infer<typeof partialExamIdInputSchema>

export const deletePartialExamResultSchema = z.object({ id: z.number().int() })

export type DeletePartialExamResult = z.infer<typeof deletePartialExamResultSchema>
