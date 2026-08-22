// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AskArtifactReport, AskHistoryMessage, TranscriptWindowMarker } from '../../../shared/ipc/ask'
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

// Generated-artifact outcome line (cli-generated-artifacts spec "Transcript
// reporting is plain text, action-free, and transient"; design "Renderer
// Delta" + the bounded exception named in the invariant docstring above the
// component). `liveArtifact` is a prop of `AskTranscript` itself — NOT a
// field on `AskEntry` — because it must render for a turn regardless of
// whether that turn's result entry came from `localEntries` or from
// `derivedEntries` built off freshly-persisted history (see design D6).
describe('AskTranscript — generated artifact outcome line', () => {
  const answerEntries: readonly AskEntry[] = [
    { kind: 'answer', id: 1, text: 'Acá tenés el resumen que pediste.', citations: [] }
  ]

  it('renders the saved outcome naming the file and subject', () => {
    const artifact: AskArtifactReport = { status: 'saved', fileName: 'resumen-parcial-1.md', subjectName: 'Álgebra' }

    render(<AskTranscript entries={answerEntries} liveArtifact={artifact} />)

    expect(screen.getByText('Se guardó "resumen-parcial-1.md" en Álgebra.')).toBeInTheDocument()
  })

  it('renders the failed outcome naming the file and subject', () => {
    const artifact: AskArtifactReport = { status: 'failed', fileName: 'resumen-parcial-1.md', subjectName: 'Álgebra' }

    render(<AskTranscript entries={answerEntries} liveArtifact={artifact} />)

    expect(screen.getByText('No se pudo guardar "resumen-parcial-1.md" en Álgebra.')).toBeInTheDocument()
  })

  // Table-driven over the closed seven-reason set (spec's exact enum) — each
  // reason gets its own distinct, app-owned sentence, never a raw code.
  it.each([
    ['malformed-block', 'El modelo intentó generar un documento con un formato inválido. No se guardó.'],
    ['invalid-header', 'El modelo intentó generar un documento con datos inválidos. No se guardó.'],
    ['empty-content', 'El modelo intentó generar un documento vacío. No se guardó.'],
    ['oversize', 'El modelo intentó generar un documento demasiado grande. No se guardó.'],
    ['invalid-filename', 'El modelo intentó generar un documento con un nombre de archivo inválido. No se guardó.'],
    ['unknown-subject', 'El modelo intentó generar un documento para una materia que no encontré. No se guardó.'],
    ['ambiguous-subject', 'El modelo intentó generar un documento para una materia ambigua. No se guardó.']
  ] as const)('renders the %s drop reason with its own copy', (reason, expectedText) => {
    const artifact: AskArtifactReport = { status: 'dropped', reason }

    render(<AskTranscript entries={answerEntries} liveArtifact={artifact} />)

    expect(screen.getByText(expectedText)).toBeInTheDocument()
  })

  it('renders no interactive elements on the outcome line', () => {
    const artifact: AskArtifactReport = { status: 'dropped', reason: 'oversize' }

    const { container } = render(<AskTranscript entries={answerEntries} liveArtifact={artifact} />)

    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders the model answer regardless of the artifact outcome', () => {
    const artifact: AskArtifactReport = { status: 'dropped', reason: 'unknown-subject' }

    render(<AskTranscript entries={answerEntries} liveArtifact={artifact} />)

    expect(screen.getByText('Acá tenés el resumen que pediste.')).toBeInTheDocument()
    expect(
      screen.getByText('El modelo intentó generar un documento para una materia que no encontré. No se guardó.')
    ).toBeInTheDocument()
  })

  it('renders nothing extra when no artifact was reported', () => {
    render(<AskTranscript entries={answerEntries} />)

    expect(screen.queryByText(/no se guardó/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Se guardó/)).not.toBeInTheDocument()
  })

  // The explicit non-replay scenario (spec "Reopening a conversation does not
  // replay the outcome line"): entries built the SAME way the container
  // builds them for a reopened thread — through `toEntries` off persisted
  // messages — with no `liveArtifact` passed, because a reopened thread is
  // never "the live turn". Nothing in `entries`/`toEntries` can carry an
  // artifact report (askResultSchema was never extended for it), so this
  // also proves the line cannot leak in through persisted data.
  it('does not replay an outcome line when rendering a reopened past conversation', () => {
    const messages: AskHistoryMessage[] = [
      {
        id: 1,
        question: '¿Me armás un resumen de la clase 3?',
        model: 'sonnet',
        result: { kind: 'answer', answer: 'Acá tenés el resumen que pediste.', citations: [] },
        createdAt: '2026-08-18T09:00'
      }
    ]
    const window: TranscriptWindowMarker = { startMessageId: 1, excludedCount: 0 }
    const entries = toEntries(messages, window)

    render(<AskTranscript entries={entries} />)

    expect(screen.getByText('Acá tenés el resumen que pediste.')).toBeInTheDocument()
    expect(screen.queryByText(/no se guardó/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Se guardó/)).not.toBeInTheDocument()
  })
})
