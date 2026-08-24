// Shared IPC contract for the `finales:*` channels.
//
// FinalExam instances are cascade-deleted with their subject, but they have
// their OWN lifecycle — you add a mesa, you record how it went, you delete a
// mistake — so they get their own command set, the same asymmetry Deadline
// has against ScheduleSlot.
//
// The record shape itself lives in `./materias` (the subject detail payload
// carries it, and importing it from here would close a cycle).
import { z } from 'zod'
import { finalExamResultSchema, ipcErr, ipcOk, type IpcResult, parsePayload } from './materias'

export { ipcErr, ipcOk, type IpcResult, parsePayload }

// Calendar date, `YYYY-MM-DD` — a mesa is a day, not a moment.
//
// Validation messages are STABLE MACHINE KEYS, not prose — see the
// architecture note at the top of shared/ipc/materias.ts (this module stays
// framework-free the same way).
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date.invalid')

// `<input type="date">` emits '' when cleared, which means "no date yet" —
// a first-class state here, not a validation failure.
const optionalDate = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  localDateSchema.nullable()
)

export const createFinalExamInputSchema = z.object({
  subjectId: z.number().int().positive(),
  label: z.string().trim().min(1, 'label.required').max(200, 'label.tooLong'),
  takenOn: optionalDate,
  result: finalExamResultSchema.default('pendiente')
})

export type CreateFinalExamInput = z.infer<typeof createFinalExamInputSchema>

export const updateFinalExamInputSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().trim().min(1, 'label.required').max(200, 'label.tooLong'),
  takenOn: optionalDate,
  result: finalExamResultSchema
})

export type UpdateFinalExamInput = z.infer<typeof updateFinalExamInputSchema>

export const finalExamIdInputSchema = z.object({ id: z.number().int().positive() })

export type FinalExamIdInput = z.infer<typeof finalExamIdInputSchema>

export const deleteFinalExamResultSchema = z.object({ id: z.number().int() })

export type DeleteFinalExamResult = z.infer<typeof deleteFinalExamResultSchema>
