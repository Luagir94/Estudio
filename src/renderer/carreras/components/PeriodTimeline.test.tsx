// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PeriodRecord } from '../../../shared/ipc/carreras'
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
})
