// Shared IPC contract for the `ask:*` channels (design D6 / spec
// "Question/Answer IPC Contract"). Parsed on BOTH sides, matching the
// two-sided-parsing convention (`src/shared/ipc/materias.ts`).
import { z } from 'zod'
import { enabledCliProviderSchema, modelIdSchema } from './cli'
import { ipcErr, ipcOk, type IpcResult, parsePayload } from './materias'

export { ipcErr, ipcOk, type IpcResult, parsePayload }

// --- ask:question request -------------------------------------------------

// A question now names WHICH CLI answers it as well as which model.
//
// `model` used to be an opaque three-key enum resolved to a literal inside the
// spawn boundary, because the resolved string reaches the cmd.exe command line
// on the shim branch. It is now a real model id — not because that hole got
// less dangerous, but because no CLI of the three can enumerate what an
// account actually has, so a fixed table could only ever go stale. What
// replaced the enum is `modelIdSchema`'s character whitelist here plus the
// branded `validateModelId` gate at the boundary itself: the id is checked on
// both sides, and only the branded form type-checks into a spawn.
export const askQuestionInputSchema = z.object({
  question: z.string().trim().min(1, 'question is required').max(4000, 'question is too long'),
  provider: enabledCliProviderSchema,
  model: modelIdSchema,
  conversationId: z.number().int().positive().optional()
})

export type AskQuestionInput = z.infer<typeof askQuestionInputSchema>

// --- ask:question result ---------------------------------------------------

/** The app sections a data citation can point at — the same vocabulary the sidebar uses. */
export const citationSectionSchema = z.enum(['materias', 'horario', 'entregas', 'finales', 'carreras'])

export type CitationSection = z.infer<typeof citationSectionSchema>

// Two kinds of source, because the corpus has two kinds of thing in it: files
// the CLI reads off disk, and rows out of the app's own database. Both stay
// checkable — a citation always names something the student can go and look
// at. Every field carries its own non-empty floor: `citations.min(1)` below
// counts the ARRAY, not its contents, so without these a citation of empty
// strings satisfies the mandatory-citations rule while pointing nowhere.
export const citationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('archivo'),
    subject: z.string().trim().min(1, 'a file citation must name its subject'),
    file: z.string().trim().min(1, 'a file citation must name its file')
  }),
  z.object({
    kind: z.literal('dato'),
    section: citationSectionSchema,
    label: z.string().trim().min(1, 'a data citation must carry a label')
  })
])

export type Citation = z.infer<typeof citationSchema>

// Three outcomes, and the VARIANT is what tells the reader where the answer
// came from. `answer` is grounded in the student's own corpus and must cite at
// least one source; `general` is the model answering without it and is marked
// as such on screen; `not-found` carries no model text at all.
//
// This is what lets the panel answer freely without becoming untrustworthy: a
// sourced answer and an unsourced one are different shapes, so they can never
// be confused for one another.
export const askAnswerResultSchema = z.object({
  kind: z.literal('answer'),
  answer: z.string().trim().min(1, 'an answer must carry text'),
  citations: z.array(citationSchema).min(1, 'an answer must carry at least one citation')
})

export type AskAnswerResult = z.infer<typeof askAnswerResultSchema>

// `.strict()`: a stray `citations` array here would be an unsourced answer
// wearing a sourced answer's clothes, so drift must fail loudly.
export const askGeneralResultSchema = z
  .object({
    kind: z.literal('general'),
    answer: z.string().trim().min(1, 'a general answer must carry text')
  })
  .strict()

export type AskGeneralResult = z.infer<typeof askGeneralResultSchema>

export const askNotFoundResultSchema = z.object({ kind: z.literal('not-found') }).strict()

export type AskNotFoundResult = z.infer<typeof askNotFoundResultSchema>

export const askResultSchema = z.discriminatedUnion('kind', [
  askAnswerResultSchema,
  askGeneralResultSchema,
  askNotFoundResultSchema
])

export type AskResult = z.infer<typeof askResultSchema>

// --- ask:question turn response --------------------------------------------

// cli-generated-artifacts spec "Explicit discriminated-union artifact
// outcome report" / design "IPC Delta". Lives ALONGSIDE `askResultSchema`,
// never inside it — `askResultSchema` and persisted ask history receive ZERO
// edits for this capability (design D1: the block is split from the inner
// text before the result JSON is even parsed).
export const askArtifactDropReasonSchema = z.enum([
  'malformed-block',
  'invalid-header',
  'empty-content',
  'oversize',
  'invalid-filename',
  'unknown-subject',
  'ambiguous-subject'
])

export type AskArtifactDropReason = z.infer<typeof askArtifactDropReasonSchema>

export const askArtifactReportSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('saved'), fileName: z.string(), subjectName: z.string() }),
  z.object({ status: z.literal('failed'), fileName: z.string(), subjectName: z.string() }),
  z.object({ status: z.literal('dropped'), reason: askArtifactDropReasonSchema })
])

export type AskArtifactReport = z.infer<typeof askArtifactReportSchema>

// Wraps every completed-outcome branch with the conversation it landed in
// (design D1/D5). `conversationId: null` is the per-turn WRITE-FAILURE
// signal ONLY — it means exactly "this turn was not saved". It is NEVER a
// thread-selection value; the renderer must never feed it into thread
// selection state.
//
// `artifact` is OPTIONAL and TRANSIENT (design D6, cli-generated-artifacts
// spec "Transcript reporting is plain text, action-free, and transient") —
// present only on the live turn that produced it, absent when no artifact
// block was emitted, and never persisted into ask history.
export const askTurnResponseSchema = z.object({
  conversationId: z.number().int().positive().nullable(),
  result: askResultSchema,
  artifact: askArtifactReportSchema.optional()
})

export type AskTurnResponse = z.infer<typeof askTurnResponseSchema>

// --- ask:question / ask:cancel typed errors --------------------------------

// Complete typed-error domain (design D3/D6), mapped to app-owned Spanish
// copy in the renderer (WU5) — never raw model/process text as the error.
// `NO_ATTACHMENTS` is deliberately absent: an empty corpus is no longer a
// refusal. The panel answers anyway and marks the result `general`, so there
// is no failure to report. `NOT_FOUND` (design D1) is returned when a
// continued thread's `conversationId` does not exist — always before any spawn.
export const askErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'CLI_NOT_FOUND',
  'CLI_UNUSABLE',
  'OVERSIZED_ATTACHMENT',
  'BUSY',
  'TIMEOUT',
  'OUTPUT_TOO_LARGE',
  // The composed prompt did not fit the command line of a CLI that takes its
  // question as an ARGUMENT rather than on stdin. Distinct from
  // `VALIDATION_ERROR`, whose copy is about the question the student typed:
  // this one is about the question PLUS the course context around it, and
  // telling someone their 30-word question is too long would be a lie.
  'PROMPT_TOO_LARGE',
  'MALFORMED_RESPONSE',
  'EXECUTION_FAILED',
  'CANCELED',
  'NOT_FOUND'
])

export type AskErrorCode = z.infer<typeof askErrorCodeSchema>

// --- ask:listConversations / ask:getConversation / ask:deleteConversation --
// Deferred from the earlier contract batch (design D5) until
// `registerAskHandlers` actually consumes them.

export const conversationSummarySchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export type ConversationSummary = z.infer<typeof conversationSummarySchema>

export const listConversationsResultSchema = z.array(conversationSummarySchema)

export type ListConversationsResult = z.infer<typeof listConversationsResultSchema>

// Read-side `model`: plain `z.string()`, deliberately WIDER than the closed
// write-side `askModelSchema` enum above — a persisted row must outlive the
// current 3-key enum (design D5). This string MUST NEVER flow back into the
// write path: the write-side `model` resolves into the command line via
// `PROMPT_EXECUTION_MODELS[model]` at the sole spawn site
// (`claudeExecutableValidator.ts`), and a persisted string re-entering that
// closed-enum gate would reopen the exact hole the opaque-key design closed.
export const askHistoryMessageSchema = z.object({
  id: z.number().int().positive(),
  question: z.string(),
  model: z.string(),
  result: askResultSchema,
  createdAt: z.string()
})

export type AskHistoryMessage = z.infer<typeof askHistoryMessageSchema>

export const getConversationInputSchema = z.object({ id: z.number().int().positive() })

export type GetConversationInput = z.infer<typeof getConversationInputSchema>

// The boundary marker (design D2) — read from the SAME `computeTranscriptWindow`
// call `askService` uses to build the prompt, never re-derived separately.
export const transcriptWindowMarkerSchema = z.object({
  startMessageId: z.number().int().positive().nullable(),
  excludedCount: z.number().int().nonnegative()
})

export type TranscriptWindowMarker = z.infer<typeof transcriptWindowMarkerSchema>

export const getConversationResultSchema = z.object({
  conversation: conversationSummarySchema,
  messages: z.array(askHistoryMessageSchema),
  window: transcriptWindowMarkerSchema
})

export type GetConversationResult = z.infer<typeof getConversationResultSchema>

export const deleteConversationInputSchema = z.object({ id: z.number().int().positive() })

export type DeleteConversationInput = z.infer<typeof deleteConversationInputSchema>

export const deleteConversationResultSchema = z.object({ id: z.number().int().positive() })

export type DeleteConversationResult = z.infer<typeof deleteConversationResultSchema>
