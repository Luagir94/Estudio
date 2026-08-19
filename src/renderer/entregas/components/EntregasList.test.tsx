// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DeadlineWithSubject } from '../../../shared/ipc/entregas'
import { EntregasList } from './EntregasList'

const now = new Date(2027, 7, 18, 12, 0)

function makeDeadline(overrides: Partial<DeadlineWithSubject>): DeadlineWithSubject {
  return {
    id: 1,
    subjectId: 1,
    title: 'TP 2 — Scheduler',
    type: 'Trabajo práctico',
    dueAt: '2027-08-22T23:59',
    done: false,
    subjectName: 'Sistemas Operativos',
    subjectColor: '#4c8dff',
    ...overrides
  }
}

describe('EntregasList (design node K6MVx: bucket groups)', () => {
  it('renders a heading and row for each non-empty bucket, in ATRASADAS / PRÓXIMOS 7 DÍAS / MÁS ADELANTE / COMPLETADAS order', () => {
    const deadlines = [
      makeDeadline({ id: 1, title: 'Informe de lectura 2', dueAt: '2027-08-16T23:59' }), // atrasadas
      makeDeadline({ id: 2, title: 'TP 2 — Scheduler', dueAt: '2027-08-22T23:59' }), // proximos7
      makeDeadline({ id: 3, title: 'TP 3 — Sistemas de archivos', dueAt: '2027-09-01T23:59' }), // masAdelante
      makeDeadline({ id: 4, title: 'TP 1 — Procesos', dueAt: '2027-07-01T23:59', done: true }) // completadas
    ]

    render(<EntregasList deadlines={deadlines} now={now} onEdit={vi.fn()} onToggleDone={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByText('ATRASADAS')).toBeInTheDocument()
    expect(screen.getByText('PRÓXIMOS 7 DÍAS')).toBeInTheDocument()
    expect(screen.getByText('MÁS ADELANTE')).toBeInTheDocument()
    expect(screen.getByText('COMPLETADAS')).toBeInTheDocument()
    expect(screen.getByText('Informe de lectura 2')).toBeInTheDocument()
    expect(screen.getByText('TP 2 — Scheduler')).toBeInTheDocument()
    expect(screen.getByText('TP 3 — Sistemas de archivos')).toBeInTheDocument()
    expect(screen.getByText('TP 1 — Procesos')).toBeInTheDocument()
  })

  it('omits a bucket heading entirely when that bucket is empty', () => {
    const deadlines = [makeDeadline({ id: 1, dueAt: '2027-08-22T23:59' })] // proximos7 only

    render(<EntregasList deadlines={deadlines} now={now} onEdit={vi.fn()} onToggleDone={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.queryByText('ATRASADAS')).not.toBeInTheDocument()
    expect(screen.queryByText('MÁS ADELANTE')).not.toBeInTheDocument()
    expect(screen.queryByText('COMPLETADAS')).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no deadlines at all', () => {
    render(<EntregasList deadlines={[]} now={now} onEdit={vi.fn()} onToggleDone={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByText(/todavía no agregaste ninguna entrega/i)).toBeInTheDocument()
  })
})
