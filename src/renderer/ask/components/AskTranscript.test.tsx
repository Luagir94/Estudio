// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AskHistoryMessage, TranscriptWindowMarker } from '../../../shared/ipc/ask'
import { SearchX } from 'lucide-react'
import { ASK_MEMORY_BOUNDARY_MARKER, ASK_NOT_FOUND, ASK_NOT_SAVED } from '../domain/askDisplay'
import { toEntries } from '../domain/historyEntries'
import { AskTranscript, type AskEntry } from './AskTranscript'

function message(overrides: Partial<AskHistoryMessage> & { id: number }): AskHistoryMessage {
  return {
    question: `pregunta ${overrides.id}`,
    model: 'sonnet',
    result: { kind: 'not-found' },
    createdAt: '2026-08-18T09:00',
    ...overrides
  }
}

// The boundary kind was local to `historyEntries.ts` in PR3a (deliberately —
// `AskTranscript`'s exhaustive-shaped render had no arm for it yet, so
// merging it into the shared `AskEntry` union would have failed `tsc`). This
// slice closes that: the union carries `boundary` and this component renders
// it. Structure and copy only — the final visual form is pen-gated (PR4).
describe('AskTranscript — boundary entry', () => {
  it('renders the memory-boundary marker with its own copy', () => {
    const entries: readonly AskEntry[] = [{ kind: 'boundary', id: -1 }]

    render(<AskTranscript entries={entries} />)

    expect(screen.getByText(ASK_MEMORY_BOUNDARY_MARKER)).toBeInTheDocument()
  })

  it('renders no marker when nothing was excluded', () => {
    const entries: readonly AskEntry[] = [{ kind: 'question', id: 1, text: '¿Y esto?' }]

    render(<AskTranscript entries={entries} />)

    expect(screen.queryByText(ASK_MEMORY_BOUNDARY_MARKER)).not.toBeInTheDocument()
  })

  // startMessageId:null + excludedCount>0 (design D2's oversized-single-turn
  // edge) places the boundary after the last message. Verified here through
  // the SAME `toEntries` the container will feed `AskTranscript`, now that
  // the shared `AskEntry` union actually has a render arm for it.
  it('places the marker after the last message when startMessageId is null and something was excluded', () => {
    const messages = [message({ id: 1 }), message({ id: 2 })]
    const window: TranscriptWindowMarker = { startMessageId: null, excludedCount: 2 }
    const entries = toEntries(messages, window)

    const { container } = render(<AskTranscript entries={entries} />)

    const text = container.textContent ?? ''
    expect(text.indexOf('pregunta 2')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('pregunta 2')).toBeLessThan(text.indexOf(ASK_MEMORY_BOUNDARY_MARKER))
  })
})

// Not-saved marker (design #268 §2): an amber pill directly UNDER the
// answer, never replacing or dimming it — the deliberate asymmetry with the
// neutral boundary pill above.
describe('AskTranscript — not-saved marker', () => {
  it('renders the answer plus the not-saved marker below it, leaving the answer text intact', () => {
    const entries: readonly AskEntry[] = [
      { kind: 'answer', id: 1, text: 'La clase es el lunes.', citations: [], notSaved: true }
    ]

    const { container } = render(<AskTranscript entries={entries} />)

    expect(screen.getByText('La clase es el lunes.')).toBeInTheDocument()
    expect(screen.getByText(ASK_NOT_SAVED)).toBeInTheDocument()
    const text = container.textContent ?? ''
    expect(text.indexOf('La clase es el lunes.')).toBeLessThan(text.indexOf(ASK_NOT_SAVED))
  })

  it('renders no not-saved marker when the flag is absent', () => {
    const entries: readonly AskEntry[] = [{ kind: 'answer', id: 1, text: 'Ok.', citations: [] }]

    render(<AskTranscript entries={entries} />)

    expect(screen.queryByText(ASK_NOT_SAVED)).not.toBeInTheDocument()
  })

  it('renders the not-saved marker under a general answer too', () => {
    const entries: readonly AskEntry[] = [{ kind: 'general', id: 1, text: 'Respuesta general.', notSaved: true }]

    render(<AskTranscript entries={entries} />)

    expect(screen.getByText(ASK_NOT_SAVED)).toBeInTheDocument()
  })

  // The third arm. A `not-found` result renders as a `state` entry, so without
  // this case a failed write on one would silently drop its honesty marker —
  // the exact class of dishonest signal this change exists to prevent.
  it('renders the not-saved marker under a not-found state entry', () => {
    const entries: readonly AskEntry[] = [
      {
        kind: 'state',
        id: 1,
        icon: SearchX,
        title: ASK_NOT_FOUND.title,
        detail: ASK_NOT_FOUND.detail,
        notSaved: true
      }
    ]

    render(<AskTranscript entries={entries} />)

    expect(screen.getByText(ASK_NOT_FOUND.title)).toBeInTheDocument()
    expect(screen.getByText(ASK_NOT_SAVED)).toBeInTheDocument()
  })
})
