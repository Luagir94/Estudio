// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { TodayClass, DashboardDeadline, FreeBlock, WeekStripDay } from '../domain/dashboard'
import { HoyDashboard } from './HoyDashboard'

beforeAll(() => {
  process.env.TZ = 'America/New_York'
})

const todayClasses: TodayClass[] = [
  {
    subjectId: 1,
    subjectName: 'Sistemas Operativos',
    subjectColor: '#4c8dff',
    slotId: 10,
    startMinutes: 480,
    endMinutes: 570,
    location: 'Aula 204'
  },
  {
    subjectId: 3,
    subjectName: 'Ingeniería de Software',
    subjectColor: '#a78bfa',
    slotId: 30,
    startMinutes: 1110,
    endMinutes: 1290,
    location: 'Aula 301'
  }
]

const freeBlocks: FreeBlock[] = [
  { gapMinutes: 390, afterSubjectName: 'Sistemas Operativos', beforeSubjectName: 'Ingeniería de Software' }
]

const deadlines: DashboardDeadline[] = [
  {
    id: 1,
    subjectId: 3,
    subjectName: 'Ingeniería de Software',
    subjectColor: '#a78bfa',
    title: 'Informe de lectura 2',
    type: 'Informe',
    dueAt: '2026-08-12T23:59',
    done: false
  }
]

const weekStrip: WeekStripDay[] = Array.from({ length: 7 }, (_unused, mondayFirstIndex) => ({
  mondayFirstIndex,
  date: new Date(2026, 7, 10 + mondayFirstIndex),
  classColors: [],
  dueCount: 0
}))

describe('HoyDashboard (design node E2pJ95 — Grupo Hoy, zero-navigation, read-only "sin acciones primarias")', () => {
  it("renders the date headline, day summary, today's classes, a free block, deadlines, and the week strip", () => {
    render(
      <HoyDashboard
        dateHeadline="Jueves 13 de agosto"
        daySummary="2 clases hoy · 1 atrasada · 1 entrega en los próximos 7 días"
        todayClasses={todayClasses}
        freeBlocks={freeBlocks}
        deadlines={deadlines}
        weekStrip={weekStrip}
        todayMondayFirstIndex={3}
        now={new Date(2026, 7, 13, 9, 0)}
      />
    )

    expect(screen.getByText('Jueves 13 de agosto')).toBeInTheDocument()
    expect(screen.getByText(/2 clases hoy/)).toBeInTheDocument()
    expect(screen.getByText('CLASES DE HOY')).toBeInTheDocument()
    expect(screen.getByText('Sistemas Operativos')).toBeInTheDocument()
    expect(screen.getAllByText('Ingeniería de Software').length).toBeGreaterThan(0)
    expect(screen.getByText(/6h 30m libres entre Sistemas Operativos e Ingeniería de Software/)).toBeInTheDocument()
    expect(screen.getByText('PRÓXIMOS 7 DÍAS')).toBeInTheDocument()
    expect(screen.getByText('Informe de lectura 2')).toBeInTheDocument()
    expect(screen.getByText('ESTA SEMANA')).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no classes today, never a blank gap', () => {
    render(
      <HoyDashboard
        dateHeadline="Sábado 15 de agosto"
        daySummary="0 clases hoy"
        todayClasses={[]}
        freeBlocks={[]}
        deadlines={[]}
        weekStrip={weekStrip}
        todayMondayFirstIndex={5}
      />
    )

    expect(screen.getByText('No tenés clases hoy.')).toBeInTheDocument()
    expect(screen.getByText('No tenés entregas próximas.')).toBeInTheDocument()
  })
})
