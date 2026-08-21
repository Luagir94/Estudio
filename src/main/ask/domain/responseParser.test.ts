import { describe, expect, it } from 'vitest'
import { parseAskResponse } from './responseParser'

// Two-layer parse (design D5): zod-lenient CLI envelope (`{ result: string
// }`), optional fence stripping, then the discriminated `askResultSchema`
// on the inner JSON. ANY failure at either layer is a typed
// `MALFORMED_RESPONSE` — raw text is NEVER surfaced as an answer.
describe('parseAskResponse', () => {
  it('parses a well-formed answer result from the CLI envelope', () => {
    const rawStdout = JSON.stringify({
      result: JSON.stringify({
        kind: 'answer',
        answer: 'La entropía mide el desorden.',
        citations: [{ kind: 'archivo', subject: 'Física', file: 'apunte-clase-3.pdf' }]
      })
    })

    const parsed = parseAskResponse(rawStdout)

    expect(parsed.ok).toBe(true)
    if (parsed.ok && parsed.data.kind === 'answer') {
      expect(parsed.data.citations).toEqual([{ kind: 'archivo', subject: 'Física', file: 'apunte-clase-3.pdf' }])
    }
  })

  it('strips a ```json code fence and parses the not-found variant inside it', () => {
    const rawStdout = JSON.stringify({ result: '```json\n{"kind": "not-found"}\n```' })

    const parsed = parseAskResponse(rawStdout)

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data).toEqual({ kind: 'not-found' })
    }
  })

  // Observed against the real CLI: its output can carry a diagnostic line
  // next to the JSON — e.g. `SessionEnd hook [...] failed: Hook cancelled`
  // from a user's own hook config. Whether that lands on stdout or stderr was
  // not established, so the parser tolerates it either way rather than
  // resting on an assumption that would break EVERY answer if it were wrong.
  const noisyEnvelope = JSON.stringify({
    result: JSON.stringify({
      kind: 'answer',
      answer: 'Sí.',
      citations: [{ kind: 'archivo', subject: 'Física', file: 'a.pdf' }]
    })
  })

  it.each([
    ['a trailing diagnostic line', `${noisyEnvelope}\nSessionEnd hook [powershell ...] failed: Hook cancelled`],
    ['a leading diagnostic line', `warning: something happened\n${noisyEnvelope}`],
    ['diagnostics on both sides', `warning: before\n${noisyEnvelope}\nSessionEnd hook failed: Hook cancelled`],
    ['trailing blank lines', `${noisyEnvelope}\n\n`]
  ])('finds the envelope despite %s', (_label, rawStdout) => {
    const parsed = parseAskResponse(rawStdout)

    expect(parsed.ok).toBe(true)
    if (parsed.ok && parsed.data.kind === 'answer') {
      expect(parsed.data.answer).toBe('Sí.')
    }
  })

  const malformedCases: [string, string][] = [
    [
      'an answer with zero citations, never rendered as an answer',
      JSON.stringify({ result: JSON.stringify({ kind: 'answer', answer: 'Sin fuente.', citations: [] }) })
    ],
    ['malformed inner JSON', JSON.stringify({ result: '{not valid json' })],
    ['envelope drift — no result field', JSON.stringify({ type: 'result', unexpected: true })],
    ['stdout that is not valid JSON at all', 'not json at all']
  ]

  it.each(malformedCases)('rejects %s as MALFORMED_RESPONSE', (_label, rawStdout) => {
    const parsed = parseAskResponse(rawStdout)

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.code).toBe('MALFORMED_RESPONSE')
    }
  })
})

// Every CLI wraps the model's answer differently, and only the OUTER layer
// differs. These prove the inner contract is identical across all three: an
// Antigravity answer and a Claude answer are the same typed value by the time
// anything downstream sees them.

/** The inner payload every provider is asked to produce, as the model writes it. */
const INNER = JSON.stringify({
  kind: 'answer',
  answer: 'La entropía mide el desorden.',
  citations: [{ kind: 'archivo', subject: 'Física', file: 'apunte-clase-3.pdf' }]
})

describe('parseAskResponse — antigravity-json envelope', () => {
  /**
   * The single completion object `agy --output-format json` prints — shaped
   * exactly like the output captured from the real binary (agy 1.1.15): a
   * successful run carries NO `error` key at all, and `structured_output`
   * appears only under `--json-schema`. Built whole here so every case below
   * is one field away from a real successful run.
   */
  const envelope = (overrides: Record<string, unknown> = {}): string =>
    JSON.stringify({
      conversation_id: '51872578-f09a-4d00-b68d-8943b9955aed',
      status: 'SUCCESS',
      response: INNER,
      duration_seconds: 3.4500712,
      num_turns: 1,
      usage: { input_tokens: 18989, output_tokens: 85, thinking_tokens: 84, cache_read_tokens: 0, total_tokens: 19074 },
      ...overrides
    })

  it('reads the answer out of the { status, response, usage } envelope', () => {
    const parsed = parseAskResponse(envelope(), 'antigravity-json')

    expect(parsed.ok).toBe(true)
    if (parsed.ok && parsed.data.kind === 'answer') {
      expect(parsed.data.answer).toBe('La entropía mide el desorden.')
    }
  })

  it('strips a fence the model wrapped its JSON in', () => {
    const fenced = envelope({ response: ['```json', INNER, '```'].join('\n') })

    expect(parseAskResponse(fenced, 'antigravity-json').ok).toBe(true)
  })

  // The verified failure envelope, captured verbatim from the real binary: a
  // well-formed object on stdout carrying `status: ERROR` and a populated
  // `error`. Reading `response` past that would surface the CLI's own failure
  // text as though the model had answered the student's question.
  it('refuses the ERROR envelope the binary prints for an empty prompt', () => {
    const rawStdout = JSON.stringify({
      conversation_id: '',
      status: 'ERROR',
      response: '',
      error: 'Error: empty prompt. Usage: agy --print "your prompt here"',
      duration_seconds: 0,
      num_turns: 0,
      usage: { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0 }
    })

    const parsed = parseAskResponse(rawStdout, 'antigravity-json')

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.code).toBe('MALFORMED_RESPONSE')
  })

  // Two independent failure signals, and EITHER one is disqualifying: a run
  // that reports an error is a failed run even when it also carries a response,
  // and a non-SUCCESS status is a failed run even when it reports no error.
  it('refuses an envelope carrying an error even when a response is present', () => {
    expect(parseAskResponse(envelope({ error: 'quota exceeded' }), 'antigravity-json').ok).toBe(false)
  })

  it.each(['ERROR', 'CANCELED', 'INTERRUPTED', 'INVALID', 'WAITING', 'RUNNING'])(
    'refuses the %s status even with a complete response beside it',
    (status) => {
      expect(parseAskResponse(envelope({ status }), 'antigravity-json').ok).toBe(false)
    }
  )

  // An empty `error` string is not an error. The binary omits the key entirely
  // on success, but a future build that always emitted it must not turn every
  // good answer into a failure.
  it('still accepts a run that reports an empty error string', () => {
    expect(parseAskResponse(envelope({ error: '' }), 'antigravity-json').ok).toBe(true)
  })

  // The THIRD failure mode, and the nastiest: exit 0 with nothing at all on
  // stdout, because a tool needed a permission headless mode cannot prompt for.
  // Nothing is not an answer — and it must never become an empty one.
  it.each([
    ['completely empty stdout', ''],
    ['whitespace only', '   \n  \n'],
    ['stdout that is not JSON at all', 'jetski: no output produced — a tool required a permission']
  ])('refuses %s rather than reporting an empty success', (_label, rawStdout) => {
    const parsed = parseAskResponse(rawStdout, 'antigravity-json')

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.code).toBe('MALFORMED_RESPONSE')
  })

  // Claude's envelope names the field `result`. Accepting it here would mean
  // the parser was not actually checking which CLI it was reading.
  it('does not accept the Claude envelope', () => {
    expect(parseAskResponse(JSON.stringify({ result: INNER }), 'antigravity-json').ok).toBe(false)
  })

  // The citation floor is the app's, not the provider's: an answer without a
  // source is refused no matter which CLI produced it.
  it('still enforces the citation floor on an answer from this provider', () => {
    const noCitations = JSON.stringify({ kind: 'answer', answer: 'Un anillo es…', citations: [] })

    expect(parseAskResponse(envelope({ response: noCitations }), 'antigravity-json').ok).toBe(false)
  })
})

describe('parseAskResponse — codex-jsonl envelope', () => {
  const line = (event: Record<string, unknown>): string => JSON.stringify(event) + '\n'

  it('finds the agent message among the other events in the stream', () => {
    const rawStdout =
      line({ type: 'thread.started', thread_id: 'abc' }) +
      line({ type: 'turn.started' }) +
      line({ type: 'item.started', item: { id: '1', type: 'agent_message', status: 'in_progress' } }) +
      line({ type: 'item.completed', item: { id: '1', type: 'agent_message', text: INNER } }) +
      line({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 20 } })

    const parsed = parseAskResponse(rawStdout, 'codex-jsonl')

    expect(parsed.ok).toBe(true)
    if (parsed.ok && parsed.data.kind === 'answer') {
      expect(parsed.data.answer).toBe('La entropía mide el desorden.')
    }
  })

  // A turn can complete more than one item. The answer this app asked for is
  // the one the run ended on.
  it('takes the LAST completed agent message when the turn produced several', () => {
    const stale = JSON.stringify({ kind: 'general', answer: 'una respuesta vieja' })
    const rawStdout =
      line({ type: 'item.completed', item: { id: '1', type: 'agent_message', text: stale } }) +
      line({ type: 'item.completed', item: { id: '2', type: 'agent_message', text: INNER } })

    const parsed = parseAskResponse(rawStdout, 'codex-jsonl')

    expect(parsed.ok).toBe(true)
    if (parsed.ok && parsed.data.kind === 'answer') {
      expect(parsed.data.answer).toBe('La entropía mide el desorden.')
    }
  })

  // Command output and other item types share the stream. Reading one of them
  // as the answer would put raw tool output on screen as though it were one.
  it('ignores completed items that are not agent messages', () => {
    const rawStdout =
      line({ type: 'item.completed', item: { id: '1', type: 'command_execution', text: 'rm -rf /' } }) +
      line({ type: 'item.completed', item: { id: '2', type: 'agent_message', text: INNER } })

    expect(parseAskResponse(rawStdout, 'codex-jsonl').ok).toBe(true)
  })

  it('is malformed when the stream carries no agent message at all', () => {
    const rawStdout = line({ type: 'turn.started' }) + line({ type: 'turn.completed', usage: {} })

    const parsed = parseAskResponse(rawStdout, 'codex-jsonl')

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.code).toBe('MALFORMED_RESPONSE')
  })

  // The citation floor is the app's, not the provider's: an answer without a
  // source is refused no matter which CLI produced it.
  it('still enforces the citation floor on an answer from this provider', () => {
    const noCitations = JSON.stringify({ kind: 'answer', answer: 'Un anillo es…', citations: [] })
    const rawStdout = line({ type: 'item.completed', item: { id: '1', type: 'agent_message', text: noCitations } })

    expect(parseAskResponse(rawStdout, 'codex-jsonl').ok).toBe(false)
  })
})
