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
})
