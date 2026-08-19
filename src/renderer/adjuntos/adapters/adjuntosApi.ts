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
  listAttachmentsResultSchema
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
  }
}
