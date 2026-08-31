// IPC-backed port implementation (design "Renderer (PR3 — design-gated)").
// Crosses the preload bridge via `window.api.adjuntos`, then Zod-parses the
// response before handing typed data to TanStack Query — the same
// two-directional parsing rule the other adapters follow (design §2 /
// `finalesApi.ts`).
import {
  addAttachmentsResultSchema,
  type AddAttachmentsResult,
  type Attachment,
  createMarkdownDocumentResultSchema,
  deleteAttachmentResultSchema,
  type DeleteAttachmentResult,
  listAttachmentsResultSchema,
  readAttachmentTextResultSchema,
  writeAttachmentTextResultSchema
} from '../../../shared/ipc/adjuntos'
import { assertIpcOk, IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

// The bridge never throws (design §2) — it resolves an `IpcResult` envelope.
// This error preserves the envelope's typed `code` across the throw, unlike
// a plain `Error`, because the container needs to distinguish
// `ATTACHMENT_FILE_MISSING` from every other `adjuntos:open` failure to
// drive the "Archivo no encontrado" row state.
export class AdjuntosApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'AdjuntosApiError'
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
  /**
   * "Nuevo documento": creates a seeded `.md` attachment for the materia and
   * returns its row, so the caller can open the editor on it without waiting
   * for the list to refetch.
   */
  createDocument(subjectId: number, name: string): Promise<Attachment>
}

export const adjuntosApi: AdjuntosApi = {
  async list(subjectId) {
    return unwrapIpcResult(await window.api.adjuntos.list(subjectId), listAttachmentsResultSchema, AdjuntosApiError)
  },
  async add(subjectId) {
    return unwrapIpcResult(await window.api.adjuntos.add({ subjectId }), addAttachmentsResultSchema, AdjuntosApiError)
  },
  async open(id) {
    assertIpcOk(await window.api.adjuntos.open(id), AdjuntosApiError)
  },
  async delete(id) {
    return unwrapIpcResult(await window.api.adjuntos.remove(id), deleteAttachmentResultSchema, AdjuntosApiError)
  },
  async read(id) {
    return unwrapIpcResult(await window.api.adjuntos.read(id), readAttachmentTextResultSchema, AdjuntosApiError).content
  },
  async write(id, content) {
    return unwrapIpcResult(
      await window.api.adjuntos.write(id, content),
      writeAttachmentTextResultSchema,
      AdjuntosApiError
    )
  },
  async createDocument(subjectId, name) {
    return unwrapIpcResult(
      await window.api.adjuntos.createDocument({ subjectId, name }),
      createMarkdownDocumentResultSchema,
      AdjuntosApiError
    )
  }
}
