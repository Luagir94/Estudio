// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PeriodRecord, TimelineMarkerRecord } from '../../../shared/ipc/carreras'
import { clampedMarkerPosition, timelineScale } from '../domain/timeline'
import { PeriodTimeline } from './PeriodTimeline'

const today = new Date(2026, 7, 15)

const periods: PeriodRecord[] = [
  {
    id: 1,
    programId: 1,
    name: '1er Cuatrimestre 2026',
    kind: 'cuatrimestre',
    startsOn: '2026-03-09',
    endsOn: '2026-07-18'
  },
  { id: 2, programId: 1, name: 'Anual 2026', kind: 'anual', startsOn: '2026-03-09', endsOn: '2026-11-20' },
  {
    id: 3,
    programId: 1,
    name: '2do Cuatrimestre 2026',
    kind: 'cuatrimestre',
    startsOn: '2026-08-12',
    endsOn: '2026-12-04'
  }
]

function barOf(name: string): HTMLElement {
  const label = screen.getByText(name)
  const row = label.closest('li')
  if (!row) throw new Error(`no row for ${name}`)
  const bar = row.querySelector('span[style*="width"]')
  if (!(bar instanceof HTMLElement)) throw new Error(`no bar for ${name}`)
  return bar
}

function widthOf(name: string): number {
  return Number.parseFloat(barOf(name).style.width)
}

function leftOf(name: string): number {
  return Number.parseFloat(barOf(name).style.left)
}

function trackOf(name: string): HTMLElement {
  const label = screen.getByText(name)
  const row = label.closest('li')
  if (!row) throw new Error(`no row for ${name}`)
  const track = row.querySelector('[data-testid="timeline-track"]')
  if (!(track instanceof HTMLElement)) throw new Error(`no track for ${name}`)
  return track
}

function marker(overrides: Partial<TimelineMarkerRecord> = {}): TimelineMarkerRecord {
  return {
    kind: 'parcial',
    id: 1,
    subjectId: 10,
    periodId: 3,
    subjectName: 'ITICS',
    label: 'Parcial 1',
    date: '2026-09-10',
    ...overrides
  }
}

describe('PeriodTimeline', () => {
  it('renders nothing when the carrera has no periods yet', () => {
    const { container } = render(<PeriodTimeline periods={[]} now={today} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('draws one bar per period', () => {
    render(<PeriodTimeline periods={periods} now={today} />)

    for (const period of periods) {
      expect(screen.getByText(period.name)).toBeInTheDocument()
    }
  })

  // The whole point of the timeline: an overlapping annual period is
  // visibly wider than, and starts alongside, the cuatrimestre it overlaps.
  it('shows the annual period spanning both cuatrimestres', () => {
    render(<PeriodTimeline periods={periods} now={today} />)

    expect(leftOf('Anual 2026')).toBe(leftOf('1er Cuatrimestre 2026'))
    expect(widthOf('Anual 2026')).toBeGreaterThan(widthOf('1er Cuatrimestre 2026'))
    expect(widthOf('Anual 2026')).toBeGreaterThan(widthOf('2do Cuatrimestre 2026'))
  })

  it('runs an open-ended bar to the right edge and labels it', () => {
    render(
      <PeriodTimeline
        periods={[{ id: 9, programId: 1, name: 'Clases', kind: 'clases', startsOn: '2024-03-04', endsOn: null }]}
        now={today}
      />
    )

    expect(leftOf('Clases') + widthOf('Clases')).toBeCloseTo(100, 5)
    expect(screen.getByText('No termina')).toBeInTheDocument()
  })

  it('marks today when it falls inside the drawn window', () => {
    render(<PeriodTimeline periods={periods} now={today} />)

    expect(screen.getByText('hoy')).toBeInTheDocument()
  })

  it('shows the status legend', () => {
    render(<PeriodTimeline periods={periods} now={today} />)

    expect(screen.getByText('Finalizado')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Próximo')).toBeInTheDocument()
  })

  // The design's `Row Label` is `textGrowth: auto` — it never clips. The
  // `truncate` this used to carry was invented in code, and it clipped the ONE
  // thing that tells two rows apart on a screen with no way in: the timeline
  // is read-only, so a period whose name is cut here has no detail view, no
  // expansion and no second rendering to recover it from.
  //
  // The 160px column stays: it is what starts every bar at the same x. Only
  // the clipping goes, so a long name takes a second line instead of a `…`.
  it('never clips a period name — the timeline has no detail view to recover it from', () => {
    render(
      <PeriodTimeline
        periods={[
          {
            id: 9,
            programId: 1,
            name: '2do Cuatrimestre extendido con turno de examen 2026',
            kind: 'cuatrimestre',
            startsOn: '2026-08-12',
            endsOn: '2026-12-04'
          }
        ]}
        now={today}
      />
    )

    const label = screen.getByText('2do Cuatrimestre extendido con turno de examen 2026')
    expect(label).not.toHaveClass('truncate')
    expect(label).toHaveClass('break-words')
    // The column that keeps the bars aligned is not what was wrong.
    expect(label).toHaveClass('w-40', 'shrink-0')
  })
})

// Marker wiring (design D7-D11, pen-delta #543): the domain (timelineMarkers.ts)
// already proves filtering/positioning/clustering in isolation — these tests
// prove THIS component actually calls it and dispatches on the result.
describe('PeriodTimeline — upcoming markers', () => {
  it("renders a marker as an absolute child of its owning period row's track, never the bar, at the domain-computed clamped percent", () => {
    const upcoming = marker({ periodId: 3, date: '2026-09-10' })
    render(<PeriodTimeline periods={periods} now={today} markers={[upcoming]} onOpenSubject={vi.fn()} />)

    const chip = screen.getByTestId('timeline-marker')
    expect(trackOf('2do Cuatrimestre 2026').contains(chip)).toBe(true)
    expect(barOf('2do Cuatrimestre 2026').contains(chip)).toBe(false)

    const scale = timelineScale(periods, today)!
    expect(Number.parseFloat(chip.style.left)).toBeCloseTo(clampedMarkerPosition(upcoming.date, scale), 5)
  })

  it('does not render a marker dated before now', () => {
    render(
      <PeriodTimeline
        periods={periods}
        now={today}
        markers={[marker({ date: '2026-01-01' })]}
        onOpenSubject={vi.fn()}
      />
    )

    expect(screen.queryByTestId('timeline-marker')).not.toBeInTheDocument()
  })

  it('grows only the row with a marker to 34px, keeping every other row at 26px exactly as today', () => {
    render(
      <PeriodTimeline
        periods={periods}
        now={today}
        markers={[marker({ periodId: 3, date: '2026-09-10' })]}
        onOpenSubject={vi.fn()}
      />
    )

    expect(trackOf('2do Cuatrimestre 2026')).toHaveClass('h-[34px]')
    expect(trackOf('1er Cuatrimestre 2026')).toHaveClass('h-[26px]')
    expect(trackOf('Anual 2026')).toHaveClass('h-[26px]')
    expect(barOf('2do Cuatrimestre 2026')).toHaveClass('top-0', 'h-[26px]')
  })

  it('keeps every track at 26px when there are no markers at all — the eventless regression case', () => {
    render(<PeriodTimeline periods={periods} now={today} />)

    for (const period of periods) {
      expect(trackOf(period.name)).toHaveClass('h-[26px]')
      expect(trackOf(period.name)).not.toHaveClass('h-[34px]')
    }
  })

  it('clusters two markers within the threshold into one cluster chip instead of two single markers', () => {
    render(
      <PeriodTimeline
        periods={periods}
        now={today}
        markers={[marker({ id: 1, date: '2026-09-10' }), marker({ id: 2, kind: 'final', date: '2026-09-11' })]}
        onOpenSubject={vi.fn()}
      />
    )

    expect(screen.getByTestId('timeline-marker-cluster')).toBeInTheDocument()
    expect(screen.queryByTestId('timeline-marker')).not.toBeInTheDocument()
  })

  it('shows the event-kind legend after a divider, reusing the existing markerKind copy', () => {
    render(<PeriodTimeline periods={periods} now={today} />)

    expect(screen.getByText('Parcial')).toBeInTheDocument()
    expect(screen.getByText('Final')).toBeInTheDocument()
    expect(screen.getByText('Entrega')).toBeInTheDocument()
  })
})
