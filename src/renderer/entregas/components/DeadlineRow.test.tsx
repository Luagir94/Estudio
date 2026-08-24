// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DeadlineWithSubject } from '../../../shared/ipc/entregas'
import { DeadlineRow } from './DeadlineRow'

const pendingDeadline: DeadlineWithSubject = {
  id: 1,
  subjectId: 1,
  title: 'TP 2 — Scheduler',
  type: 'Trabajo práctico',
  dueAt: '2027-08-22T23:59',
  done: false,
  subjectName: 'Sistemas Operativos',
  subjectColor: '#4c8dff'
}

const now = new Date(2027, 7, 18, 12, 0)

describe('DeadlineRow (design node AHToB)', () => {
  it('renders the date chip, title, subject, and status pill', () => {
    render(
      <DeadlineRow deadline={pendingDeadline} now={now} onEdit={vi.fn()} onToggleDone={vi.fn()} onDelete={vi.fn()} />
    )

    expect(screen.getByText('22')).toBeInTheDocument()
    expect(screen.getByText('AGO')).toBeInTheDocument()
    expect(screen.getByText('TP 2 — Scheduler')).toBeInTheDocument()
    expect(screen.getByText('Sistemas Operativos')).toBeInTheDocument()
    expect(screen.getByText('En 4 días')).toBeInTheDocument()
  })

  it('applies strikethrough and muted styling to a completed deadline (spec: "Toggle done/pending")', () => {
    render(
      <DeadlineRow
        deadline={{ ...pendingDeadline, done: true }}
        now={now}
        onEdit={vi.fn()}
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText('TP 2 — Scheduler')).toHaveClass('line-through')
    expect(screen.getByText('Completada')).toHaveClass('bg-muted', 'text-muted-foreground')
  })

  describe('status pill urgency styling (violet is reserved for interaction, never for status)', () => {
    function renderPill(dueAt: string): HTMLElement {
      render(
        <DeadlineRow
          deadline={{ ...pendingDeadline, dueAt }}
          now={now}
          onEdit={vi.fn()}
          onToggleDone={vi.fn()}
          onDelete={vi.fn()}
        />
      )
      const pill = screen.getByText(/atraso|Hoy|Mañana|En \d/)
      expect(pill.className).not.toContain('violet')
      return pill
    }

    it('paints an overdue pill urgent on urgent-soft', () => {
      expect(renderPill('2027-08-16T10:00')).toHaveClass('bg-(--color-urgent-soft)', 'text-(--color-urgent)')
    })

    it('paints a due-tomorrow (imminent) pill warn on warn-soft', () => {
      expect(renderPill('2027-08-19T09:00')).toHaveClass('bg-(--color-warn-soft)', 'text-(--color-warn)')
    })

    it('paints a due-in-5-days (this-week) pill ink-secondary on surface-sunken', () => {
      expect(renderPill('2027-08-23T12:00')).toHaveClass('bg-(--color-surface-sunken)', 'text-(--color-ink-secondary)')
    })

    it('paints a due-in-8-days (later) pill ink-muted on surface-sunken', () => {
      expect(renderPill('2027-08-26T12:00')).toHaveClass('bg-(--color-surface-sunken)', 'text-(--color-ink-muted)')
    })
  })

  it('clicking the row body calls onEdit with the deadline', () => {
    const onEdit = vi.fn()
    render(
      <DeadlineRow deadline={pendingDeadline} now={now} onEdit={onEdit} onToggleDone={vi.fn()} onDelete={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: /TP 2 — Scheduler/ }))

    expect(onEdit).toHaveBeenCalledWith(pendingDeadline)
  })

  it('toggling the done checkbox calls onToggleDone with the flipped value', () => {
    const onToggleDone = vi.fn()
    render(
      <DeadlineRow
        deadline={pendingDeadline}
        now={now}
        onEdit={vi.fn()}
        onToggleDone={onToggleDone}
        onDelete={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /marcar como completada/i }))

    expect(onToggleDone).toHaveBeenCalledWith(true)
  })

  it('clicking delete calls onDelete with the deadline', () => {
    const onDelete = vi.fn()
    render(
      <DeadlineRow deadline={pendingDeadline} now={now} onEdit={vi.fn()} onToggleDone={vi.fn()} onDelete={onDelete} />
    )

    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }))

    expect(onDelete).toHaveBeenCalledWith(pendingDeadline)
  })
})
