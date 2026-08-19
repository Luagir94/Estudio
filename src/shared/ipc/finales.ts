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
import { finalExamResultSchema, ipcErr, ipcOk, type IpcResult } from './materias'

export { ipcErr, ipcOk, type IpcResult }

// Calendar date, `YYYY-MM-DD` — a mesa is a day, not a moment.
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a calendar date (YYYY-MM-DD)')

// `<input type="date">` emits '' when cleared, which means "no date yet" —
// a first-class state here, not a validation failure.
const optionalDate = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  localDateSchema.nullable()
)

export const createFinalExamInputSchema = z.object({
  subjectId: z.number().int().positive(),
  label: z.string().trim().min(1, 'label is required').max(200, 'label is too long'),
  takenOn: optionalDate,
  result: finalExamResultSchema.default('pendiente')
})

export type CreateFinalExamInput = z.infer<typeof createFinalExamInputSchema>

export const updateFinalExamInputSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().trim().min(1, 'label is required').max(200, 'label is too long'),
  takenOn: optionalDate,
  result: finalExamResultSchema
})

export type UpdateFinalExamInput = z.infer<typeof updateFinalExamInputSchema>

export const finalExamIdInputSchema = z.object({ id: z.number().int().positive() })

export type FinalExamIdInput = z.infer<typeof finalExamIdInputSchema>

export const deleteFinalExamResultSchema = z.object({ id: z.number().int() })

export type DeleteFinalExamResult = z.infer<typeof deleteFinalExamResultSchema>
