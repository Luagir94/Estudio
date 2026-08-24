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
    // A zero-deadline list is "nothing loaded yet", not an achievement.
    expect(screen.queryByText('Estás al día')).not.toBeInTheDocument()
  })

  describe('all-clear celebration (no overdue, nothing in the next 7 days)', () => {
    function renderList(deadlines: DeadlineWithSubject[]) {
      return render(
        <EntregasList deadlines={deadlines} now={now} onEdit={vi.fn()} onToggleDone={vi.fn()} onDelete={vi.fn()} />
      )
    }

    it('celebrates above the remaining groups and names the next later deadline date', () => {
      const { container } = renderList([
        makeDeadline({ id: 1, title: 'TP 3 — Sistemas de archivos', dueAt: '2027-08-28T23:59' }), // masAdelante
        makeDeadline({ id: 2, title: 'TP 1 — Procesos', dueAt: '2027-07-01T23:59', done: true }) // completadas
      ])

      expect(screen.getByText('Estás al día')).toBeInTheDocument()
      expect(
        screen.getByText('Sin atrasos ni entregas en los próximos 7 días · la próxima es el 28 de agosto')
      ).toBeInTheDocument()
      expect(container.querySelector('svg.lucide-check')).not.toBeNull()
      // The remaining groups still render below, untouched.
      expect(screen.getByText('MÁS ADELANTE')).toBeInTheDocument()
      expect(screen.getByText('COMPLETADAS')).toBeInTheDocument()
      // The empty urgent buckets leave no headings behind.
      expect(screen.queryByText('ATRASADAS')).not.toBeInTheDocument()
      expect(screen.queryByText('PRÓXIMOS 7 DÍAS')).not.toBeInTheDocument()
    })

    it('drops the next-date mention when nothing pending remains', () => {
      renderList([makeDeadline({ id: 1, dueAt: '2027-07-01T23:59', done: true })]) // completadas only

      expect(screen.getByText('Estás al día')).toBeInTheDocument()
      expect(screen.getByText('Sin atrasos ni entregas en los próximos 7 días')).toBeInTheDocument()
    })

    it('does not celebrate while something is due within 7 days', () => {
      renderList([makeDeadline({ id: 1, dueAt: '2027-08-22T23:59' })]) // proximos7

      expect(screen.queryByText('Estás al día')).not.toBeInTheDocument()
    })

    it('does not celebrate while something is overdue', () => {
      renderList([
        makeDeadline({ id: 1, dueAt: '2027-08-16T23:59' }), // atrasadas
        makeDeadline({ id: 2, dueAt: '2027-09-01T23:59' }) // masAdelante
      ])

      expect(screen.queryByText('Estás al día')).not.toBeInTheDocument()
    })
  })
})
