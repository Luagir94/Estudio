// Shared IPC contract for the `adjuntos:*` channels (design "IPC Contract
// (PR2)"). `storedPath` is deliberately NOT part of `attachmentSchema` — see
// design "storedPath visibility": the renderer never receives filesystem
// paths, only main ever resolves them, at the single choke point
// (`resolveAttachmentPath`).
import { z } from 'zod'
import { ipcErr, ipcOk, type IpcResult, parsePayload } from './materias'

export { ipcErr, ipcOk, type IpcResult, parsePayload }

export const attachmentSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  fileName: z.string(),
  // NULL in v1 — no mime-detection library in the frozen stack (design
  // "mimeType v1"); the OS decides how to open the file via shell.openPath.
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int(),
  // Reserved for a future rename/title-editing UI (spec "First-Slice
  // Non-Goals") — this slice never writes or exposes it in the renderer.
  title: z.string().nullable(),
  createdAt: z.string(),
  // Closed set (attachment-fts-index design "Status storage", spec "Status
  // lifecycle") — rides on the existing `adjuntos:list` payload, one query
  // serves the badge (slice 2c), no new channel needed.
  indexStatus: z.enum(['pending', 'indexed', 'not-indexable']),
  // Provenance (cli-generated-artifacts spec "Origin provenance column and
  // badge"): 'user' for a normal upload, 'ai-generated' for a document the
  // ask-generated-artifacts save path wrote on the model's behalf,
  // 'class-note' for the apunte of one class. Rides on the same
  // `adjuntos:list` payload as `indexStatus`, no new channel.
  origin: z.enum(['user', 'ai-generated', 'class-note']),
  // Set only on a class apunte: the local `YYYY-MM-DD` of the class it
  // belongs to. The ADJUNTOS list never carries one — class apuntes are
  // filtered out of it, because they have their own section on the subject
  // detail and listing them twice would turn ADJUNTOS into noise. It travels
  // so the VIEWER can title an apunte by its class instead of its filename.
  classDate: z.string().nullable()
})

export type Attachment = z.infer<typeof attachmentSchema>

// --- adjuntos:list -----------------------------------------------------

export const listAttachmentsInputSchema = z.object({ subjectId: z.number().int() })

export type ListAttachmentsInput = z.infer<typeof listAttachmentsInputSchema>

export const listAttachmentsResultSchema = z.array(attachmentSchema)

export type ListAttachmentsResult = z.infer<typeof listAttachmentsResultSchema>

// --- adjuntos:add --------------------------------------------------------

// The dialog itself lives in main — the request only carries which subject
// the picked files attach to (design "Flows").
export const addAttachmentsInputSchema = z.object({ subjectId: z.number().int() })

export type AddAttachmentsInput = z.infer<typeof addAttachmentsInputSchema>

export const addAttachmentFailureCodeSchema = z.enum(['FILE_TOO_LARGE', 'COPY_FAILED'])

export type AddAttachmentFailureCode = z.infer<typeof addAttachmentFailureCodeSchema>

export const addAttachmentFailureSchema = z.object({
  fileName: z.string(),
  code: addAttachmentFailureCodeSchema,
  message: z.string()
})

export type AddAttachmentFailure = z.infer<typeof addAttachmentFailureSchema>

// One file's failure never aborts the rest (spec "Add several files at
// once" / "Insert fails after copy") — `failures` reports each rejected
// file alongside whichever files DID succeed in the same batch.
export const addAttachmentsResultSchema = z.object({
  canceled: z.boolean(),
  added: z.array(attachmentSchema),
  failures: z.array(addAttachmentFailureSchema)
})

export type AddAttachmentsResult = z.infer<typeof addAttachmentsResultSchema>

// --- adjuntos:open -------------------------------------------------------

export const openAttachmentInputSchema = z.object({ id: z.number().int() })

export type OpenAttachmentInput = z.infer<typeof openAttachmentInputSchema>

// --- adjuntos:read ---------------------------------------------------------

/**
 * Cap for the in-app markdown viewer/editor: 1 MiB. Distinct from
 * `MAX_ATTACHMENT_BYTES` (250 MB, the upload cap) — a document held in a
 * `<textarea>` and re-indexed on every save has a much lower ceiling than a
 * file the OS merely opens. Enforced twice on purpose: the write schema
 * below caps the payload's LENGTH at the bridge, and the main-process
 * service re-checks the BYTE length (UTF-8 multibyte content can exceed the
 * byte cap at a legal character count).
 */
export const MAX_MARKDOWN_TEXT_BYTES = 1_048_576

export const readAttachmentTextInputSchema = z.object({ id: z.number().int() })

export type ReadAttachmentTextInput = z.infer<typeof readAttachmentTextInputSchema>

// A content STRING, never a filesystem path — same `storedPath` visibility
// rule as `attachmentSchema` above: the renderer edits text, only main ever
// touches the file.
export const readAttachmentTextResultSchema = z.object({ content: z.string() })

export type ReadAttachmentTextResult = z.infer<typeof readAttachmentTextResultSchema>

// --- adjuntos:write --------------------------------------------------------

export const writeAttachmentTextInputSchema = z.object({
  id: z.number().int(),
  content: z.string().max(MAX_MARKDOWN_TEXT_BYTES)
})

export type WriteAttachmentTextInput = z.infer<typeof writeAttachmentTextInputSchema>

// The updated row rides back on the write response so the viewer's header
// (size, index badge) refreshes without a second round-trip.
export const writeAttachmentTextResultSchema = attachmentSchema

export type WriteAttachmentTextResult = z.infer<typeof writeAttachmentTextResultSchema>

// --- adjuntos:delete -------------------------------------------------------

export const deleteAttachmentInputSchema = z.object({ id: z.number().int() })

export type DeleteAttachmentInput = z.infer<typeof deleteAttachmentInputSchema>

// Row deletion always commits first; `fileRemoved` reports whether the
// best-effort unlink that follows actually succeeded (spec "Delete
// Attachment" — a locked or already-missing file must never block or
// reverse the row deletion).
export const deleteAttachmentResultSchema = z.object({
  id: z.number().int(),
  fileRemoved: z.boolean()
})

export type DeleteAttachmentResult = z.infer<typeof deleteAttachmentResultSchema>
