// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AcademicDateRecord } from '../../../shared/ipc/fechas'
import { FechasCard } from './FechasCard'

const now = new Date(2026, 11, 1, 12, 0)

function makeDate(overrides: Partial<AcademicDateRecord> = {}): AcademicDateRecord {
  return {
    id: 1,
    programId: 2,
    title: 'Inscripción a finales',
    kind: 'inscripcionFinales',
    startsOn: '2026-12-01',
    endsOn: '2026-12-05',
    ...overrides
  }
}

describe('FechasCard (approved design: the carrera right-rail card)', () => {
  it('renders the heading, each title and its date display', () => {
    render(
      <FechasCard
        dates={[
          makeDate(),
          makeDate({ id: 2, title: 'Vencimiento de regularidad', startsOn: '2026-12-20', endsOn: null }),
          makeDate({ id: 3, title: 'Inscripción a cursadas', startsOn: '2027-02-10', endsOn: '2027-02-14' })
        ]}
        now={now}
        onAdd={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('FECHAS ADMINISTRATIVAS')).toBeInTheDocument()
    expect(screen.getByText('Inscripción a finales')).toBeInTheDocument()
    expect(screen.getByText('1 – 5 DIC')).toBeInTheDocument()
    expect(screen.getByText('20 DIC')).toBeInTheDocument()
    expect(screen.getByText('10 – 14 FEB')).toBeInTheDocument()
  })

  it('orders the rows by start date, oldest first', () => {
    render(
      <FechasCard
        dates={[
          makeDate({ id: 1, title: 'Febrero', startsOn: '2027-02-10', endsOn: null }),
          makeDate({ id: 2, title: 'Diciembre', startsOn: '2026-12-01', endsOn: null })
        ]}
        now={now}
        onAdd={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    const titles = screen.getAllByTestId('fechas-card-row').map((row) => row.textContent)

    expect(titles[0]).toContain('Diciembre')
    expect(titles[1]).toContain('Febrero')
  })

  // A past date is history, not a task: it stays listed so the carrera keeps
  // its record, but it stops competing for attention.
  it('de-emphasizes a date whose relevant day has passed', () => {
    render(
      <FechasCard
        dates={[makeDate({ id: 1, title: 'Ya cerró', startsOn: '2026-11-01', endsOn: '2026-11-05' })]}
        now={now}
        onAdd={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('Ya cerró').className).toContain('text-muted-foreground')
  })

  it('opens creation from the accent action', async () => {
    const onAdd = vi.fn()
    render(<FechasCard dates={[]} now={now} onAdd={onAdd} onSelect={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Agregar fecha' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('opens the row for editing when it is clicked', async () => {
    const onSelect = vi.fn()
    const date = makeDate()
    render(<FechasCard dates={[date]} now={now} onAdd={vi.fn()} onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: /Inscripción a finales/ }))

    expect(onSelect).toHaveBeenCalledWith(date)
  })

  it('says so when the carrera has no dates yet, and still offers the action', () => {
    render(<FechasCard dates={[]} now={now} onAdd={vi.fn()} onSelect={vi.fn()} />)

    expect(screen.getByText(/todavía no tiene fechas administrativas/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar fecha' })).toBeInTheDocument()
  })
})
