import { describe, expect, it } from 'vitest'
import { computeTranscriptWindow, serializeTranscriptTurn, type TranscriptSourceTurn } from './transcriptWindow'

function turn(messageId: number, question: string, answer: string): TranscriptSourceTurn {
  return {
    messageId,
    question,
    result: { kind: 'answer', answer, citations: [{ kind: 'archivo', subject: 'Álgebra', file: 'apunte.pdf' }] }
  }
}

// Turns passed in chronological order (oldest first) — matches the
// repository's `getConversation` ordering (`ORDER BY asc(id)`).
const oldest = turn(1, '¿Qué es un anillo?', 'Un anillo es una estructura algebraica.')
const middle = turn(2, '¿Y un cuerpo?', 'Un cuerpo es un anillo donde todo elemento no nulo tiene inverso.')
const newest = turn(3, '¿Y un dominio de integridad?', 'Un anillo conmutativo sin divisores de cero.')

describe('computeTranscriptWindow', () => {
  it('accumulates newest-first and returns chronological order when everything fits [CM3]', () => {
    const result = computeTranscriptWindow([oldest, middle, newest], 10_000)

    expect(result.included).toEqual([oldest, middle, newest])
    expect(result.startMessageId).toBe(oldest.messageId)
    expect(result.excludedCount).toBe(0)
  })

  it('excludes the oldest turn whole at the exact-budget boundary', () => {
    const middleSize = serializeTranscriptTurn(middle).length
    const newestSize = serializeTranscriptTurn(newest).length
    const exactBudget = middleSize + newestSize

    const result = computeTranscriptWindow([oldest, middle, newest], exactBudget)

    expect(result.included).toEqual([middle, newest])
    expect(result.startMessageId).toBe(middle.messageId)
    expect(result.excludedCount).toBe(1)
  })

  it('returns an empty window with a null start when even the newest single turn is oversized [CM4]', () => {
    const oversized = turn(9, 'x'.repeat(50_000), 'y'.repeat(50_000))

    const result = computeTranscriptWindow([oversized], 1_000)

    expect(result.included).toEqual([])
    expect(result.startMessageId).toBeNull()
    expect(result.excludedCount).toBe(1)
  })

  it('counts every dropped turn in excludedCount, not just whether any were dropped', () => {
    const newestSize = serializeTranscriptTurn(newest).length

    const result = computeTranscriptWindow([oldest, middle, newest], newestSize)

    expect(result.included).toEqual([newest])
    expect(result.excludedCount).toBe(2)
  })

  it('defaults to ASK_TRANSCRIPT_BUDGET_CHARS when no budget is passed', () => {
    const result = computeTranscriptWindow([oldest, middle, newest])

    expect(result.included).toEqual([oldest, middle, newest])
    expect(result.excludedCount).toBe(0)
  })
})

describe('serializeTranscriptTurn', () => {
  it('is deterministic — the same turn serializes to the exact same string every time', () => {
    const first = serializeTranscriptTurn(middle)
    const second = serializeTranscriptTurn(middle)

    expect(first).toBe(second)
    expect(first).toContain(middle.question)
    expect(first).toContain('Un cuerpo es un anillo')
  })

  it('serializes a not-found turn using the app-owned line, never model text', () => {
    const notFoundTurn: TranscriptSourceTurn = { messageId: 4, question: '¿Quién ganó?', result: { kind: 'not-found' } }

    const serialized = serializeTranscriptTurn(notFoundTurn)

    expect(serialized).toContain('no se pudo responder desde la cursada')
  })
})
