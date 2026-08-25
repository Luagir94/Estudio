import { describe, expect, it } from 'vitest'
import {
  askArtifactDropReasonSchema,
  askArtifactReportSchema,
  askErrorCodeSchema,
  askHistoryMessageSchema,
  askQuestionInputSchema,
  askResultSchema,
  askTurnResponseSchema,
  citationSchema,
  conversationSummarySchema,
  deleteConversationResultSchema,
  getConversationResultSchema
} from './ask'

// Shape assertions for the two-sided IPC contract (design D6). The result is
// a DISCRIMINATED UNION — `answer` carries a non-empty `citations` array,
// `not-found` carries none — never one shape with a nullable field (D-1).
describe('askQuestionInputSchema', () => {
  it('accepts a question within the 1..4000 length range', () => {
    const result = askQuestionInputSchema.parse({
      question: '¿Qué dice el apunte de Física?',
      provider: 'claude',
      model: 'claude-sonnet-5'
    })
    expect(result.question).toBe('¿Qué dice el apunte de Física?')
    expect(result.provider).toBe('claude')
    expect(result.model).toBe('claude-sonnet-5')
  })

  it('rejects an empty question', () => {
    expect(() => askQuestionInputSchema.parse({ question: '', provider: 'claude', model: 'claude-sonnet-5' })).toThrow()
  })

  it('rejects a question longer than 4000 characters', () => {
    expect(() =>
      askQuestionInputSchema.parse({ question: 'a'.repeat(4001), provider: 'claude', model: 'claude-sonnet-5' })
    ).toThrow()
  })

  // The whole containment argument rests on this: a model id reaches the
  // cmd.exe command line on the shim branch, so the characters it may contain
  // are a WHITELIST. The id itself is now free — no CLI can enumerate the
  // models an account has, so a closed enum could only ever go stale — but
  // every character in it is still chosen by this schema, not by the caller.
  it.each([
    'sonnet" & calc',
    'sonnet%PATH%',
    'claude sonnet',
    'claude|whoami',
    'claude>out',
    '--dangerously-skip-permissions',
    'claude/sonnet',
    ''
  ])('rejects the hostile model id %s', (model) => {
    expect(() => askQuestionInputSchema.parse({ question: '¿Y esto?', provider: 'claude', model })).toThrow()
  })

  // A model this app has never heard of is EXPECTED to pass: that is the point
  // of dropping the table. What protects the boundary is its shape, not a list.
  it.each(['gpt-5-codex', 'gemini-2.5-pro', 'o3'])('accepts the unlisted but well-formed id %s', (model) => {
    expect(askQuestionInputSchema.parse({ question: '¿Y esto?', provider: 'codex', model }).model).toBe(model)
  })

  it('requires a model to be chosen', () => {
    expect(() => askQuestionInputSchema.parse({ question: '¿Y esto?', provider: 'claude' })).toThrow()
  })

  it('requires a provider to be chosen', () => {
    expect(() => askQuestionInputSchema.parse({ question: '¿Y esto?', model: 'claude-sonnet-5' })).toThrow()
  })

  it('rejects a provider this app does not support', () => {
    expect(() => askQuestionInputSchema.parse({ question: '¿Y esto?', provider: 'ollama', model: 'llama3' })).toThrow()
  })

  // Absent starts a new thread (design D1/D5); present continues it.
  it('accepts an omitted conversationId, starting a new thread', () => {
    const result = askQuestionInputSchema.parse({ question: '¿Y esto?', provider: 'claude', model: 'claude-sonnet-5' })
    expect(result.conversationId).toBeUndefined()
  })

  it('accepts a positive conversationId, continuing a thread', () => {
    const result = askQuestionInputSchema.parse({
      question: '¿Y esto?',
      provider: 'claude',
      model: 'claude-sonnet-5',
      conversationId: 7
    })
    expect(result.conversationId).toBe(7)
  })

  it.each([0, -1, 1.5])('rejects a non-positive-integer conversationId (%s)', (conversationId) => {
    expect(() =>
      askQuestionInputSchema.parse({
        question: '¿Y esto?',
        provider: 'claude',
        model: 'claude-sonnet-5',
        conversationId
      })
    ).toThrow()
  })
})

describe('citationSchema', () => {
  it('parses a subject/file citation pair', () => {
    expect(citationSchema.parse({ kind: 'archivo', subject: 'Física', file: 'apunte-clase-3.pdf' })).toEqual({
      kind: 'archivo',
      subject: 'Física',
      file: 'apunte-clase-3.pdf'
    })
  })

  it('rejects a citation missing the file field', () => {
    expect(() => citationSchema.parse({ subject: 'Física' })).toThrow()
  })

  // A citation whose fields are blank points nowhere. It would still satisfy
  // `citations.min(1)` — that floor counts the ARRAY, not its contents — so
  // without a floor on the fields themselves the mandatory-citations
  // guarantee is satisfiable with a citation the student cannot check.
  it.each([
    ['an empty subject', { kind: 'archivo', subject: '', file: 'apunte.pdf' }],
    ['an empty file', { kind: 'archivo', subject: 'Física', file: '' }],
    ['a whitespace-only subject', { kind: 'archivo', subject: '   ', file: 'apunte.pdf' }],
    ['a whitespace-only file', { kind: 'archivo', subject: 'Física', file: '\t' }]
  ])('rejects a citation with %s', (_label, citation) => {
    expect(() => citationSchema.parse(citation)).toThrow()
  })

  // Page-number citations: `page` is OPTIONAL on the archivo variant — old
  // history rows and non-paged documents (docx/txt/md/csv/xlsx) have none,
  // and absence must keep parsing exactly as before.
  describe('archivo page field', () => {
    it('parses an archivo citation carrying a positive integer page', () => {
      expect(citationSchema.parse({ kind: 'archivo', subject: 'Física', file: 'apunte.pdf', page: 12 })).toEqual({
        kind: 'archivo',
        subject: 'Física',
        file: 'apunte.pdf',
        page: 12
      })
    })

    it('parses an archivo citation with no page at all, leaving the field absent', () => {
      const parsed = citationSchema.parse({ kind: 'archivo', subject: 'Física', file: 'apunte.pdf' })
      expect(parsed).not.toHaveProperty('page')
    })

    it.each([
      ['zero', 0],
      ['negative', -3],
      ['fractional', 1.5],
      ['a string', '12'],
      ['null', null]
    ])('rejects a page that is %s', (_label, page) => {
      expect(() => citationSchema.parse({ kind: 'archivo', subject: 'Física', file: 'apunte.pdf', page })).toThrow()
    })

    it('round-trips a paged citation through an answer result unchanged', () => {
      const original = askResultSchema.parse({
        kind: 'answer',
        answer: 'La fórmula está en la página 12.',
        citations: [{ kind: 'archivo', subject: 'Física', file: 'apunte.pdf', page: 12 }]
      })

      const roundTripped = askResultSchema.parse(JSON.parse(JSON.stringify(original)))

      expect(roundTripped).toEqual(original)
    })
  })
})

describe('askResultSchema', () => {
  it('parses an answer outcome with a non-empty citations array', () => {
    const result = askResultSchema.parse({
      kind: 'answer',
      answer: 'La fórmula está en el apunte de la clase 3.',
      citations: [{ kind: 'archivo', subject: 'Física', file: 'apunte-clase-3.pdf' }]
    })
    expect(result.kind).toBe('answer')
    if (result.kind === 'answer') {
      expect(result.citations).toHaveLength(1)
    }
  })

  it('rejects an answer outcome with an empty citations array', () => {
    expect(() => askResultSchema.parse({ kind: 'answer', answer: 'Respuesta sin fuente.', citations: [] })).toThrow()
  })

  it('rejects an answer outcome whose text is blank', () => {
    expect(() =>
      askResultSchema.parse({
        kind: 'answer',
        answer: '   ',
        citations: [{ kind: 'archivo', subject: 'Física', file: 'x.pdf' }]
      })
    ).toThrow()
  })

  // The composite case the array floor alone lets through: one citation
  // present, so `.min(1)` is satisfied, but nothing in it is traceable.
  it('rejects an answer whose only citation is blank', () => {
    expect(() =>
      askResultSchema.parse({
        kind: 'answer',
        answer: 'Una respuesta.',
        citations: [{ kind: 'archivo', subject: '', file: '' }]
      })
    ).toThrow()
  })

  it('parses a not-found outcome carrying no citations field', () => {
    const result = askResultSchema.parse({ kind: 'not-found' })
    expect(result.kind).toBe('not-found')
    expect(result).not.toHaveProperty('citations')
  })

  it('rejects a not-found outcome that carries a citations field', () => {
    expect(() =>
      askResultSchema.parse({ kind: 'not-found', citations: [{ kind: 'archivo', subject: 'Física', file: 'x.pdf' }] })
    ).toThrow()
  })

  it('rejects a kind value outside the union', () => {
    expect(() => askResultSchema.parse({ kind: 'error' })).toThrow()
  })

  // The third variant is what lets the panel answer with nothing in the app
  // without becoming untrustworthy: an unsourced answer is a DIFFERENT SHAPE
  // from a sourced one, so the two can never be mistaken for each other.
  describe('general variant', () => {
    it('parses an unsourced answer carrying no citations field', () => {
      const result = askResultSchema.parse({ kind: 'general', answer: 'José Hernández, en 1872.' })

      expect(result.kind).toBe('general')
      expect(result).not.toHaveProperty('citations')
    })

    // Citations here would be an unsourced answer wearing a sourced one's
    // clothes — the exact confusion the variant exists to prevent.
    it('rejects a general outcome that smuggles in citations', () => {
      expect(() =>
        askResultSchema.parse({
          kind: 'general',
          answer: 'Algo.',
          citations: [{ kind: 'archivo', subject: 'Física', file: 'x.pdf' }]
        })
      ).toThrow()
    })

    it('rejects a general outcome whose text is blank', () => {
      expect(() => askResultSchema.parse({ kind: 'general', answer: '  ' })).toThrow()
    })
  })
})

describe('citationSchema — data citations', () => {
  it('parses a citation pointing at an app section', () => {
    expect(citationSchema.parse({ kind: 'dato', section: 'horario', label: 'Derecho Romano' })).toEqual({
      kind: 'dato',
      section: 'horario',
      label: 'Derecho Romano'
    })
  })

  it.each(['materias', 'horario', 'entregas', 'finales', 'carreras'])('accepts the %s section', (section) => {
    expect(citationSchema.parse({ kind: 'dato', section, label: 'algo' })).toMatchObject({ section })
  })

  it('rejects a section outside the app’s own vocabulary', () => {
    expect(() => citationSchema.parse({ kind: 'dato', section: 'inventada', label: 'algo' })).toThrow()
  })

  it('rejects a blank label, which would point nowhere', () => {
    expect(() => citationSchema.parse({ kind: 'dato', section: 'entregas', label: '   ' })).toThrow()
  })

  it('rejects a citation with no kind at all', () => {
    expect(() => citationSchema.parse({ subject: 'Física', file: 'x.pdf' })).toThrow()
  })
})

describe('askErrorCodeSchema', () => {
  const codes = [
    'VALIDATION_ERROR',
    'CLI_NOT_FOUND',
    'CLI_UNUSABLE',
    'OVERSIZED_ATTACHMENT',
    'BUSY',
    'TIMEOUT',
    'OUTPUT_TOO_LARGE',
    'PROMPT_TOO_LARGE',
    'MALFORMED_RESPONSE',
    'EXECUTION_FAILED',
    'CANCELED',
    'NOT_FOUND'
  ]

  it.each(codes)('accepts %s as a typed error code', (code) => {
    expect(askErrorCodeSchema.parse(code)).toBe(code)
  })

  it('rejects a code outside the union', () => {
    expect(() => askErrorCodeSchema.parse('UNKNOWN_ERROR')).toThrow()
  })
})

// The turn response wraps every completed-outcome branch (design D1/D5).
// `conversationId: null` is the per-turn write-failure signal ONLY — it is
// never a thread-selection value, and PR3's renderer must never treat it as one.
describe('askTurnResponseSchema', () => {
  it('accepts a persisted turn carrying its conversation id', () => {
    const result = askTurnResponseSchema.parse({ conversationId: 3, result: { kind: 'not-found' } })
    expect(result.conversationId).toBe(3)
  })

  it('accepts a write-failure turn carrying a null conversationId', () => {
    const result = askTurnResponseSchema.parse({ conversationId: null, result: { kind: 'not-found' } })
    expect(result.conversationId).toBeNull()
  })

  it('rejects a response missing conversationId entirely', () => {
    expect(() => askTurnResponseSchema.parse({ result: { kind: 'not-found' } })).toThrow()
  })

  it('rejects a response whose result fails schema validation', () => {
    expect(() => askTurnResponseSchema.parse({ conversationId: null, result: { kind: 'bogus' } })).toThrow()
  })
})

// cli-generated-artifacts spec "Explicit discriminated-union artifact
// outcome report" — the closed seven-value drop-reason set. `askResultSchema`
// itself is NEVER touched by this capability (design "Wire Format"): the
// artifact travels outside it as a separate, optional field below.
describe('askArtifactDropReasonSchema', () => {
  const reasons = [
    'malformed-block',
    'invalid-header',
    'empty-content',
    'oversize',
    'invalid-filename',
    'unknown-subject',
    'ambiguous-subject'
  ]

  it.each(reasons)('accepts %s as a closed drop reason', (reason) => {
    expect(askArtifactDropReasonSchema.parse(reason)).toBe(reason)
  })

  it('rejects an 8th reason outside the closed set', () => {
    expect(() => askArtifactDropReasonSchema.parse('unexpected-reason')).toThrow()
  })
})

// Discriminated union on `status` (design D1/D6) — never a single shape with
// nullable fields, same discipline as `askResultSchema` above.
describe('askArtifactReportSchema', () => {
  it('parses a saved outcome', () => {
    const result = askArtifactReportSchema.parse({
      status: 'saved',
      fileName: 'resumen-parcial-1.md',
      subjectName: 'Física'
    })
    expect(result).toEqual({ status: 'saved', fileName: 'resumen-parcial-1.md', subjectName: 'Física' })
  })

  it('parses a failed outcome', () => {
    const result = askArtifactReportSchema.parse({
      status: 'failed',
      fileName: 'resumen-parcial-1.md',
      subjectName: 'Física'
    })
    expect(result).toEqual({ status: 'failed', fileName: 'resumen-parcial-1.md', subjectName: 'Física' })
  })

  it('parses a dropped outcome carrying one of the seven closed reasons', () => {
    const result = askArtifactReportSchema.parse({ status: 'dropped', reason: 'unknown-subject' })
    expect(result).toEqual({ status: 'dropped', reason: 'unknown-subject' })
  })

  it('rejects a dropped outcome whose reason is free text, not a closed-set member', () => {
    expect(() => askArtifactReportSchema.parse({ status: 'dropped', reason: 'algo salió mal' })).toThrow()
  })

  it('rejects a status outside the union', () => {
    expect(() =>
      askArtifactReportSchema.parse({ status: 'pending', fileName: 'x.md', subjectName: 'Física' })
    ).toThrow()
  })
})

// The `artifact` field is optional and lives ALONGSIDE `result`, never
// inside it — `askResultSchema` receives zero edits for this capability
// (design "IPC Delta").
describe('askTurnResponseSchema — artifact field', () => {
  it('parses a turn response with no artifact field at all (no block emitted)', () => {
    const result = askTurnResponseSchema.parse({ conversationId: 3, result: { kind: 'not-found' } })
    expect(result.artifact).toBeUndefined()
  })

  it('parses a turn response carrying a saved artifact report alongside its result', () => {
    const result = askTurnResponseSchema.parse({
      conversationId: 3,
      result: { kind: 'not-found' },
      artifact: { status: 'saved', fileName: 'resumen-parcial-1.md', subjectName: 'Física' }
    })
    expect(result.artifact).toEqual({ status: 'saved', fileName: 'resumen-parcial-1.md', subjectName: 'Física' })
    // askResultSchema's own shape is untouched by the artifact's presence.
    expect(result.result).toEqual({ kind: 'not-found' })
  })

  it('parses a turn response carrying a dropped artifact report', () => {
    const result = askTurnResponseSchema.parse({
      conversationId: 3,
      result: { kind: 'not-found' },
      artifact: { status: 'dropped', reason: 'oversize' }
    })
    expect(result.artifact).toEqual({ status: 'dropped', reason: 'oversize' })
  })

  it('rejects a turn response whose artifact field fails schema validation', () => {
    expect(() =>
      askTurnResponseSchema.parse({
        conversationId: 3,
        result: { kind: 'not-found' },
        artifact: { status: 'dropped', reason: 'not-a-real-reason' }
      })
    ).toThrow()
  })

  // Both-sides parsing (design D6 convention): encoding a value through the
  // schema and re-parsing it back must be lossless, same round-trip
  // guarantee every other two-sided IPC shape in this file relies on.
  it('round-trips an artifact report through parse -> serialize -> parse unchanged', () => {
    const original = askTurnResponseSchema.parse({
      conversationId: 3,
      result: { kind: 'not-found' },
      artifact: { status: 'saved', fileName: 'resumen-parcial-1.md', subjectName: 'Física' }
    })

    const roundTripped = askTurnResponseSchema.parse(JSON.parse(JSON.stringify(original)))

    expect(roundTripped).toEqual(original)
  })
})

// Deferred from PR2b-service's contract batch (design D5) — list/get/delete
// channel schemas, wired up once `registerAskHandlers` gains the handlers
// that consume them (PR2b-handlers, task 2b.5).
describe('conversationSummarySchema', () => {
  it('parses a conversation summary row', () => {
    const result = conversationSummarySchema.parse({
      id: 3,
      title: '¿Qué es un anillo?',
      createdAt: '2026-08-18T09:00',
      updatedAt: '2026-08-18T09:05'
    })
    expect(result.id).toBe(3)
  })

  it('rejects a non-positive id', () => {
    expect(() => conversationSummarySchema.parse({ id: 0, title: 't', createdAt: 'x', updatedAt: 'y' })).toThrow()
  })
})

// Read-side `model` is a plain string (design D5, deliberately WIDER than the
// closed write-side `askModelSchema` enum) — a persisted row must outlive the
// current 3-key enum, but the value read back here must never be re-fed into
// the write path (`askQuestionInputSchema.model` keeps the closed gate).
describe('askHistoryMessageSchema', () => {
  it('accepts a persisted model value outside the current write-side enum', () => {
    const result = askHistoryMessageSchema.parse({
      id: 1000,
      question: '¿Qué es un anillo?',
      model: 'claude-sonnet-4-retired',
      result: { kind: 'not-found' },
      createdAt: '2026-08-18T09:00'
    })
    expect(result.model).toBe('claude-sonnet-4-retired')
  })

  it('rejects a message whose result fails schema validation', () => {
    expect(() =>
      askHistoryMessageSchema.parse({
        id: 1000,
        question: '¿Y esto?',
        model: 'sonnet',
        result: { kind: 'bogus' },
        createdAt: '2026-08-18T09:00'
      })
    ).toThrow()
  })
})

describe('getConversationResultSchema', () => {
  const conversation = { id: 1, title: 't', createdAt: '2026-08-18T09:00', updatedAt: '2026-08-18T09:00' }
  const message = {
    id: 1000,
    question: '¿Y esto?',
    model: 'sonnet',
    result: { kind: 'not-found' },
    createdAt: '2026-08-18T09:00'
  }

  it('parses a conversation with its messages and the boundary marker', () => {
    const result = getConversationResultSchema.parse({
      conversation,
      messages: [message],
      window: { startMessageId: 1000, excludedCount: 0 }
    })
    expect(result.messages).toHaveLength(1)
    expect(result.window.excludedCount).toBe(0)
  })

  // The null-start edge (design D2): nothing fit in the window.
  it('accepts a null startMessageId when nothing fit in the window', () => {
    const result = getConversationResultSchema.parse({
      conversation,
      messages: [message],
      window: { startMessageId: null, excludedCount: 1 }
    })
    expect(result.window.startMessageId).toBeNull()
  })

  it('rejects a negative excludedCount', () => {
    expect(() =>
      getConversationResultSchema.parse({
        conversation,
        messages: [],
        window: { startMessageId: null, excludedCount: -1 }
      })
    ).toThrow()
  })
})

describe('deleteConversationResultSchema', () => {
  it('parses the deleted conversation id', () => {
    expect(deleteConversationResultSchema.parse({ id: 5 })).toEqual({ id: 5 })
  })

  it('rejects a non-positive id', () => {
    expect(() => deleteConversationResultSchema.parse({ id: 0 })).toThrow()
  })
})
