import { describe, expect, it } from 'vitest'
import {
  attachmentSchema,
  MAX_MARKDOWN_TEXT_BYTES,
  readAttachmentTextInputSchema,
  readAttachmentTextResultSchema,
  writeAttachmentTextInputSchema,
  writeAttachmentTextResultSchema
} from './adjuntos'

// `origin` provenance (cli-generated-artifacts spec "Origin provenance
// column and badge"). Closed set, same convention as `indexStatus`'s enum on
// this same schema — 'class-note' joined it when a class apunte became a real
// attachment so it could reach the FTS index.
describe('attachmentSchema — origin', () => {
  const base = {
    id: 1,
    subjectId: 42,
    fileName: 'apuntes.pdf',
    mimeType: null,
    sizeBytes: 1024,
    title: null,
    createdAt: '2026-08-16T10:00',
    indexStatus: 'pending' as const,
    classDate: null
  }

  it.each(['user', 'ai-generated', 'class-note'])('parses origin %s', (origin) => {
    const result = attachmentSchema.parse({ ...base, origin })
    expect(result.origin).toBe(origin)
  })

  it('rejects an origin value outside the closed set', () => {
    expect(() => attachmentSchema.parse({ ...base, origin: 'system' })).toThrow()
  })

  it('rejects a payload missing origin entirely — the field is required, not defaulted', () => {
    expect(() => attachmentSchema.parse(base)).toThrow()
  })
})

// `adjuntos:read` / `adjuntos:write` (markdown-attachment-viewer): content
// crosses IPC as a STRING only — the renderer never receives filesystem
// paths, so the read result carries `content`, never a path.
describe('readAttachmentTextInputSchema', () => {
  it('parses a numeric id payload', () => {
    expect(readAttachmentTextInputSchema.parse({ id: 3 })).toEqual({ id: 3 })
  })

  it('rejects a non-integer id', () => {
    expect(() => readAttachmentTextInputSchema.parse({ id: 'nope' })).toThrow()
  })
})

describe('readAttachmentTextResultSchema', () => {
  it('parses a content string', () => {
    expect(readAttachmentTextResultSchema.parse({ content: '# Hola' })).toEqual({ content: '# Hola' })
  })

  it('rejects a payload without content', () => {
    expect(() => readAttachmentTextResultSchema.parse({})).toThrow()
  })
})

describe('writeAttachmentTextInputSchema', () => {
  it('parses an id + content payload', () => {
    expect(writeAttachmentTextInputSchema.parse({ id: 3, content: '# Hola' })).toEqual({ id: 3, content: '# Hola' })
  })

  it('accepts content exactly at the 1 MiB cap', () => {
    const content = 'a'.repeat(MAX_MARKDOWN_TEXT_BYTES)
    expect(writeAttachmentTextInputSchema.parse({ id: 3, content }).content).toHaveLength(MAX_MARKDOWN_TEXT_BYTES)
  })

  it('rejects content over the 1 MiB cap', () => {
    const content = 'a'.repeat(MAX_MARKDOWN_TEXT_BYTES + 1)
    expect(() => writeAttachmentTextInputSchema.parse({ id: 3, content })).toThrow()
  })
})

describe('writeAttachmentTextResultSchema', () => {
  it('is the attachment schema — the updated row rides back on the write response', () => {
    const attachment = {
      id: 1,
      subjectId: 42,
      fileName: 'resumen.md',
      mimeType: null,
      sizeBytes: 8397,
      title: null,
      createdAt: '2026-08-16T10:00',
      indexStatus: 'pending',
      classDate: null,
      origin: 'user'
    }
    expect(writeAttachmentTextResultSchema.parse(attachment)).toEqual(attachment)
  })
})

describe('MAX_MARKDOWN_TEXT_BYTES', () => {
  it('is exactly 1 MiB', () => {
    expect(MAX_MARKDOWN_TEXT_BYTES).toBe(1_048_576)
  })
})
