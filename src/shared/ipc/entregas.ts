// Shared IPC contract for the `entregas:*` channels (design §2). Imported
// by BOTH main (parses incoming payloads before executing) and renderer
// (parses responses before caching) — "one validation story, no new
// dependency" per the design's decisions table.
//
// Deliberate lifecycle asymmetry (design amendment 7): unlike
// `scheduleSlotInputSchema` (which is only ever a nested part of a
// `materias:*` payload), Deadline has its OWN full-CRUD command set here —
// create, list, update, setDone, delete — because deadlines are eventful,
// not structural (see design §2's "Deliberate lifecycle asymmetry" note).
import { z } from 'zod'
import { ipcErr, ipcOk, type IpcResult, parsePayload } from './materias'

export { ipcErr, ipcOk, type IpcResult, parsePayload }

// `fecha límite` is a LOCAL NAIVE datetime, `YYYY-MM-DDTHH:mm`, no timezone
// offset (design §3a "the DST rule") — matches the HTML5 `datetime-local`
// input's native value format exactly, so the renderer form needs no
// reformatting before submit.
//
// Validation messages are STABLE MACHINE KEYS, not prose — see the
// architecture note at the top of shared/ipc/materias.ts (this module stays
// framework-free the same way).
const localNaiveDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'dateTime.invalid')

// --- entregas:create / entregas:update request --------------------------

// Editing REUSES this exact schema (spec: "Editing MUST reuse the 'Nueva
// entrega' form and the same validation schema used for creation") — the
// update schema below only adds `id`, nothing else diverges.
export const createDeadlineInputSchema = z.object({
  // `.max` on every persisted free-text field is a bound, not a UX limit: it
  // stops a compromised or buggy renderer from writing an unbounded blob into
  // the local DB (and, downstream, into the `ask:*` prompt corpus). The caps
  // are deliberately generous — no legitimate value comes near them.
  title: z.string().trim().min(1, 'title.required').max(200, 'title.tooLong'),
  subjectId: z.number().int().positive(),
  // `type` is a free string ON PURPOSE (its option set is an inferred UI
  // judgment call, not a spec catalogue — see NuevaEntregaModal.tsx), so it
  // stays a string; the cap only bounds its length.
  type: z.string().trim().min(1, 'type.required').max(100, 'type.tooLong'),
  dueAt: localNaiveDateTimeSchema
})

export type CreateDeadlineInput = z.infer<typeof createDeadlineInputSchema>

export const updateDeadlineInputSchema = createDeadlineInputSchema.extend({
  id: z.number().int().positive()
})

export type UpdateDeadlineInput = z.infer<typeof updateDeadlineInputSchema>

// --- entregas:setDone request ---------------------------------------------

// Binary only — no partial-progress state (spec: "Toggle done/pending").
export const setDeadlineDoneInputSchema = z.object({
  id: z.number().int().positive(),
  done: z.boolean()
})

export type SetDeadlineDoneInput = z.infer<typeof setDeadlineDoneInputSchema>

// --- entregas:delete / shared id-only request -----------------------------

export const deadlineIdInputSchema = z.object({ id: z.number().int().positive() })

export type DeadlineIdInput = z.infer<typeof deadlineIdInputSchema>

// --- shared record shape (entregas:create/update/setDone response,
//     entregas:list result) -----------------------------------------------

// Enriched with subject name/color at the repository layer (a join, not a
// separate round-trip) — the Entregas screen's DeadlineRow (design node
// `AHToB`) needs both to render its "Subject Tag" without a second fetch
// per row.
export const deadlineWithSubjectSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  title: z.string(),
  type: z.string(),
  dueAt: z.string(),
  done: z.boolean(),
  subjectName: z.string(),
  subjectColor: z.string()
})

export type DeadlineWithSubject = z.infer<typeof deadlineWithSubjectSchema>

// --- entregas:list result -------------------------------------------------

// A FLAT list, not pre-grouped into buckets — grouping is a rendering-time
// concern computed from "now" in the pure renderer domain layer
// (`entregas/domain/deadline.ts`'s `groupDeadlines`), same precedent as
// `subjectDetailSchema`'s comment in `materias.ts`.
export const listDeadlinesResultSchema = z.array(deadlineWithSubjectSchema)

// --- entregas:delete result ------------------------------------------------

export const deleteDeadlineResultSchema = z.object({ id: z.number().int() })

export type DeleteDeadlineResult = z.infer<typeof deleteDeadlineResultSchema>
