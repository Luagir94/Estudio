// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { DashboardDeadline } from '../domain/dashboard'
import { DeadlineRow } from './DeadlineRow'

beforeAll(() => {
  process.env.TZ = 'America/New_York'
})

const overdueDeadline: DashboardDeadline = {
  id: 1,
  subjectId: 1,
  subjectName: 'Ingeniería de Software',
  subjectColor: '#a78bfa',
  title: 'Informe de lectura 2',
  type: 'Informe',
  dueAt: '2026-08-12T23:59',
  done: false
}

describe('DeadlineRow (design node AHToB — read-only, no checkbox/edit/delete affordances on Hoy)', () => {
  it('renders title, subject tag, and status pill; no interactive controls', () => {
    render(<DeadlineRow deadline={overdueDeadline} now={new Date(2026, 7, 13, 9, 0)} />)

    expect(screen.getByText('Informe de lectura 2')).toBeInTheDocument()
    expect(screen.getByText('Ingeniería de Software')).toBeInTheDocument()
    expect(screen.getByText('1 día de atraso')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  describe('status pill urgency styling (violet is reserved for interaction, never for status)', () => {
    const now = new Date(2026, 7, 13, 9, 0)

    function renderPill(dueAt: string, done = false): HTMLElement {
      render(<DeadlineRow deadline={{ ...overdueDeadline, dueAt, done }} now={now} />)
      const pill = screen.getByText(/atraso|Hoy|Mañana|En \d|Completada/)
      expect(pill.className).not.toContain('violet')
      return pill
    }

    it('paints an overdue pill urgent on urgent-soft', () => {
      expect(renderPill('2026-08-12T23:59')).toHaveClass('bg-(--color-urgent-soft)', 'text-(--color-urgent)')
    })

    it('paints a due-tomorrow (imminent) pill warn on warn-soft', () => {
      expect(renderPill('2026-08-14T09:00')).toHaveClass('bg-(--color-warn-soft)', 'text-(--color-warn)')
    })

    it('paints a due-in-5-days (this-week) pill ink-secondary on surface-sunken', () => {
      expect(renderPill('2026-08-18T09:00')).toHaveClass('bg-(--color-surface-sunken)', 'text-(--color-ink-secondary)')
    })

    it('paints a due-in-8-days (later) pill ink-muted on surface-sunken', () => {
      expect(renderPill('2026-08-21T09:00')).toHaveClass('bg-(--color-surface-sunken)', 'text-(--color-ink-muted)')
    })

    it('paints a completed pill with the muted treatment, matching the Entregas row', () => {
      expect(renderPill('2026-08-12T23:59', true)).toHaveClass('bg-muted', 'text-muted-foreground')
    })
  })
})
