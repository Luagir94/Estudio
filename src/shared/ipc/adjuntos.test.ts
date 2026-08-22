import { describe, expect, it } from 'vitest'
import { attachmentSchema } from './adjuntos'

// `origin` provenance (cli-generated-artifacts spec "Origin provenance
// column and badge"). Closed two-value set, same convention as
// `indexStatus`'s enum on this same schema.
describe('attachmentSchema — origin', () => {
  const base = {
    id: 1,
    subjectId: 42,
    fileName: 'apuntes.pdf',
    mimeType: null,
    sizeBytes: 1024,
    title: null,
    createdAt: '2026-08-16T10:00',
    indexStatus: 'pending' as const
  }

  it.each(['user', 'ai-generated'])('parses origin %s', (origin) => {
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
