import { describe, expect, it } from 'vitest'
import type { AskHistoryMessage, TranscriptWindowMarker } from '../../../shared/ipc/ask'
import { ASK_NOT_FOUND } from './askDisplay'
import { toEntries } from './historyEntries'

function message(overrides: Partial<AskHistoryMessage> & { id: number }): AskHistoryMessage {
  return {
    question: `pregunta ${overrides.id}`,
    model: 'sonnet',
    result: { kind: 'not-found' },
    createdAt: '2026-08-18T09:00',
    ...overrides
  }
}

describe('toEntries', () => {
  // Both this and the marker below come from `computeTranscriptWindow`
  // (design D2) — a boundary MUST only appear when it excluded something.
  it('emits no boundary entry when nothing was excluded', () => {
    const messages = [message({ id: 1 }), message({ id: 2 })]
    const window: TranscriptWindowMarker = { startMessageId: 1, excludedCount: 0 }

    const entries = toEntries(messages, window)

    expect(entries.some((entry) => entry.kind === 'boundary')).toBe(false)
  })

  // The marker sits exactly above the oldest INCLUDED message — read from the
  // window's own `startMessageId`, never a separately computed cut point.
  it('places the boundary entry immediately before the message matching startMessageId [CM5,CM6]', () => {
    const messages = [message({ id: 1 }), message({ id: 2 }), message({ id: 3 })]
    const window: TranscriptWindowMarker = { startMessageId: 2, excludedCount: 1 }

    const entries = toEntries(messages, window)
    const boundaryIndex = entries.findIndex((entry) => entry.kind === 'boundary')
    const message2QuestionIndex = entries.findIndex((entry) => entry.kind === 'question' && entry.text === 'pregunta 2')

    expect(boundaryIndex).toBeGreaterThanOrEqual(0)
    expect(boundaryIndex).toBe(message2QuestionIndex - 1)
  })

  // Edge case (design D2): the newest turn alone exceeds the budget, so the
  // window is empty and `startMessageId` is `null` — the marker still has to
  // land somewhere, and design D6 says AFTER the last message.
  it('places the boundary entry after the last message when startMessageId is null and something was excluded', () => {
    const messages = [message({ id: 1 }), message({ id: 2 })]
    const window: TranscriptWindowMarker = { startMessageId: null, excludedCount: 2 }

    const entries = toEntries(messages, window)

    expect(entries.at(-1)?.kind).toBe('boundary')
  })

  // `startMessageId: null` with NOTHING excluded (e.g. an empty conversation)
  // must not be confused with the "everything excluded" edge above.
  it('emits no boundary entry when startMessageId is null and nothing was excluded', () => {
    const window: TranscriptWindowMarker = { startMessageId: null, excludedCount: 0 }

    const entries = toEntries([], window)

    expect(entries).toEqual([])
  })

  // Defensive guard (validator #262, mandatory fix 2): unreachable today
  // because the handler derives `window` and `messages` from the same rows,
  // but this is the one path where proposal Decision 6's ban on silent
  // forgetting had no guard. If `startMessageId` ever names a message the
  // list does not contain, the marker must still render — never vanish.
  it('still renders the boundary entry when startMessageId names a message absent from the list', () => {
    const messages = [message({ id: 1 }), message({ id: 2 })]
    const window: TranscriptWindowMarker = { startMessageId: 99, excludedCount: 1 }

    const entries = toEntries(messages, window)

    expect(entries.filter((entry) => entry.kind === 'boundary')).toHaveLength(1)
    expect(entries.at(-1)?.kind).toBe('boundary')
  })

  it('maps an answer result to the existing answer entry kind', () => {
    const messages = [
      message({
        id: 1,
        result: {
          kind: 'answer',
          answer: 'Un anillo de división es…',
          citations: [{ kind: 'archivo', subject: 'Álgebra', file: 'a.pdf' }]
        }
      })
    ]
    const window: TranscriptWindowMarker = { startMessageId: 1, excludedCount: 0 }

    const entries = toEntries(messages, window)

    expect(entries).toContainEqual({
      kind: 'answer',
      id: expect.any(Number),
      text: 'Un anillo de división es…',
      citations: [{ kind: 'archivo', subject: 'Álgebra', file: 'a.pdf' }]
    })
  })

  it('maps a general result to the existing general entry kind', () => {
    const messages = [message({ id: 1, result: { kind: 'general', answer: 'Respuesta sin fuentes.' } })]
    const window: TranscriptWindowMarker = { startMessageId: 1, excludedCount: 0 }

    const entries = toEntries(messages, window)

    expect(entries).toContainEqual({ kind: 'general', id: expect.any(Number), text: 'Respuesta sin fuentes.' })
  })

  // There is no dedicated not-found AskEntry kind — it becomes a `state`
  // entry carrying the app's own ASK_NOT_FOUND copy [AM3].
  it('maps a not-found result to a state entry carrying ASK_NOT_FOUND copy [AM3]', () => {
    const messages = [message({ id: 1, result: { kind: 'not-found' } })]
    const window: TranscriptWindowMarker = { startMessageId: 1, excludedCount: 0 }

    const entries = toEntries(messages, window)

    expect(entries).toContainEqual(
      expect.objectContaining({ kind: 'state', title: ASK_NOT_FOUND.title, detail: ASK_NOT_FOUND.detail })
    )
  })

  it('emits a question entry per message carrying its text', () => {
    const messages = [message({ id: 7, question: '¿Qué es un cuerpo?' })]
    const window: TranscriptWindowMarker = { startMessageId: 7, excludedCount: 0 }

    const entries = toEntries(messages, window)

    expect(entries).toContainEqual({ kind: 'question', id: expect.any(Number), text: '¿Qué es un cuerpo?' })
  })

  // Every entry (question + result, per message) plus the boundary need
  // distinct ids — a collision would break React reconciliation.
  it('gives every entry a unique id', () => {
    const messages = [message({ id: 1 }), message({ id: 2 })]
    const window: TranscriptWindowMarker = { startMessageId: 2, excludedCount: 1 }

    const entries = toEntries(messages, window)
    const ids = entries.map((entry) => entry.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})
