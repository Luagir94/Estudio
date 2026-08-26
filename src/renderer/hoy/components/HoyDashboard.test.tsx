// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  TodayClassWithMarks,
  DashboardDeadline,
  FreeBlock,
  NextClassOccurrence,
  WeekStripDay
} from '../domain/dashboard'
import { HoyDashboard } from './HoyDashboard'

beforeAll(() => {
  process.env.TZ = 'America/New_York'
})

// Every row now carries its class mark: unmarked here, which is the absence of
// a stored row rather than a fourth status.
const todayClasses: TodayClassWithMarks[] = [
  {
    subjectId: 1,
    subjectName: 'Sistemas Operativos',
    subjectColor: '#4c8dff',
    slotId: 10,
    startMinutes: 480,
    endMinutes: 570,
    location: 'Aula 204',
    attendanceStatus: null,
    hasNote: false
  },
  {
    subjectId: 3,
    subjectName: 'Ingeniería de Software',
    subjectColor: '#a78bfa',
    slotId: 30,
    startMinutes: 1110,
    endMinutes: 1290,
    location: 'Aula 301',
    attendanceStatus: null,
    hasNote: false
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
        nextClass={null}
        now={new Date(2026, 7, 13, 9, 0)}
        onMarkAttendance={vi.fn()}
        onOpenClase={vi.fn()}
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

  describe('next-class highlight (in-progress-first rule, see getNextClassHighlight)', () => {
    function renderAt(now: Date): void {
      render(
        <HoyDashboard
          dateHeadline="Jueves 13 de agosto"
          daySummary="2 clases hoy · 1 atrasada · 1 entrega en los próximos 7 días"
          todayClasses={todayClasses}
          freeBlocks={freeBlocks}
          deadlines={deadlines}
          weekStrip={weekStrip}
          todayMondayFirstIndex={3}
          nextClass={null}
          now={now}
          onMarkAttendance={vi.fn()}
          onOpenClase={vi.fn()}
        />
      )
    }

    it('pins the "starts in" pill and accent border to the next upcoming class only', () => {
      renderAt(new Date(2026, 7, 13, 17, 45)) // between the two classes; the 18:30 one is next

      const pill = screen.getByText('En 45 min')
      expect(pill.closest('div')).toHaveTextContent('Ingeniería de Software')
      expect(pill.closest('div')).toHaveClass('border-brand')
      expect(screen.getByText('Sistemas Operativos').closest('div')).toHaveClass('border-border')
      expect(screen.getByText('Sistemas Operativos').closest('div')).not.toHaveClass('border-brand')
    })

    it('reads "Ahora" on the class currently in progress', () => {
      renderAt(new Date(2026, 7, 13, 8, 30)) // inside Sistemas Operativos 08:00-09:30

      expect(screen.getByText('Ahora').closest('div')).toHaveTextContent('Sistemas Operativos')
    })

    it('highlights nothing after the last class of the day has ended', () => {
      renderAt(new Date(2026, 7, 13, 22, 30))

      expect(screen.queryByText('Ahora')).not.toBeInTheDocument()
      expect(screen.queryByText(/^En \d/)).not.toBeInTheDocument()
    })
  })

  describe('designed empty state (no classes today)', () => {
    function renderEmpty(nextClass: NextClassOccurrence | null) {
      return render(
        <HoyDashboard
          dateHeadline="Sábado 15 de agosto"
          daySummary="0 clases hoy"
          todayClasses={[]}
          freeBlocks={[]}
          deadlines={[]}
          weekStrip={weekStrip}
          todayMondayFirstIndex={5}
          nextClass={nextClass}
          onMarkAttendance={vi.fn()}
          onOpenClase={vi.fn()}
        />
      )
    }

    it('renders the coffee-circle card with the title and the derived next-class subtitle', () => {
      const { container } = renderEmpty({
        daysAhead: 2,
        dayOfWeek: 1,
        startMinutes: 480,
        subjectName: 'Sistemas Operativos'
      })

      expect(screen.getByText('Hoy no tenés clases')).toBeInTheDocument()
      expect(screen.getByText('La próxima es el lunes · 08:00 · Sistemas Operativos')).toBeInTheDocument()
      expect(container.querySelector('svg.lucide-coffee')).not.toBeNull()
    })

    it('falls back to the simpler line when no next class is derivable', () => {
      renderEmpty(null)

      expect(screen.getByText('Hoy no tenés clases')).toBeInTheDocument()
      expect(screen.getByText('Todavía no hay clases cargadas en tu horario')).toBeInTheDocument()
    })

    it('keeps the deadlines column and the week strip rendering as they do', () => {
      renderEmpty(null)

      expect(screen.getByText('PRÓXIMOS 7 DÍAS')).toBeInTheDocument()
      expect(screen.getByText('No tenés entregas próximas.')).toBeInTheDocument()
      expect(screen.getByText('ESTA SEMANA')).toBeInTheDocument()
    })
  })
})
