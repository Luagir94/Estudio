// IPC-backed port implementation (design "Renderer (PR3 — design-gated)").
// Crosses the preload bridge via `window.api.adjuntos`, then Zod-parses the
// response before handing typed data to TanStack Query — the same
// two-directional parsing rule the other adapters follow (design §2 /
// `finalesApi.ts`).
import {
  addAttachmentsResultSchema,
  type AddAttachmentsResult,
  type Attachment,
  deleteAttachmentResultSchema,
  type DeleteAttachmentResult,
  listAttachmentsResultSchema,
  readAttachmentTextResultSchema,
  writeAttachmentTextResultSchema
} from '../../../shared/ipc/adjuntos'

// The bridge never throws (design §2) — it resolves an `IpcResult` envelope.
// This error preserves the envelope's typed `code` across the throw, unlike
// a plain `Error`, because the container needs to distinguish
// `ATTACHMENT_FILE_MISSING` from every other `adjuntos:open` failure to
// drive the "Archivo no encontrado" row state.
export class AdjuntosApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AdjuntosApiError'
    this.code = code
  }
}

export interface AdjuntosApi {
  list(subjectId: number): Promise<Attachment[]>
  add(subjectId: number): Promise<AddAttachmentsResult>
  open(id: number): Promise<void>
  delete(id: number): Promise<DeleteAttachmentResult>
  /** Markdown viewer read (markdown-attachment-viewer): the file's content as a STRING — never a path. */
  read(id: number): Promise<string>
  /** Markdown editor save: returns the updated attachment row (new sizeBytes, indexStatus back to pending). */
  write(id: number, content: string): Promise<Attachment>
}

export const adjuntosApi: AdjuntosApi = {
  async list(subjectId) {
    const result = await window.api.adjuntos.list(subjectId)
    if (!result.ok) {
      throw new AdjuntosApiError(result.error.code, result.error.message)
    }
    return listAttachmentsResultSchema.parse(result.data)
  },
  async add(subjectId) {
    const result = await window.api.adjuntos.add({ subjectId })
    if (!result.ok) {
      throw new AdjuntosApiError(result.error.code, result.error.message)
    }
    return addAttachmentsResultSchema.parse(result.data)
  },
  async open(id) {
    const result = await window.api.adjuntos.open(id)
    if (!result.ok) {
      throw new AdjuntosApiError(result.error.code, result.error.message)
    }
  },
  async delete(id) {
    const result = await window.api.adjuntos.remove(id)
    if (!result.ok) {
      throw new AdjuntosApiError(result.error.code, result.error.message)
    }
    return deleteAttachmentResultSchema.parse(result.data)
  },
  async read(id) {
    const result = await window.api.adjuntos.read(id)
    if (!result.ok) {
      throw new AdjuntosApiError(result.error.code, result.error.message)
    }
    return readAttachmentTextResultSchema.parse(result.data).content
  },
  async write(id, content) {
    const result = await window.api.adjuntos.write(id, content)
    if (!result.ok) {
      throw new AdjuntosApiError(result.error.code, result.error.message)
    }
    return writeAttachmentTextResultSchema.parse(result.data)
  }
}
