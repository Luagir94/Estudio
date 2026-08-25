// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AcademicDateWithProgram } from '../../../shared/ipc/fechas'
import { AcademicDateRow } from './AcademicDateRow'

const now = new Date(2026, 10, 28, 9, 0)

function makeDate(overrides: Partial<AcademicDateWithProgram> = {}): AcademicDateWithProgram {
  return {
    id: 1,
    programId: 2,
    title: 'Inscripción a finales',
    kind: 'inscripcionFinales',
    startsOn: '2026-12-01',
    endsOn: '2026-12-05',
    programName: 'Ingeniería en Sistemas',
    ...overrides
  }
}

describe('AcademicDateRow (approved design: the trámite row inside the Entregas groups)', () => {
  it('chips the day it happens, names it, and tags the carrera as a trámite', () => {
    render(<AcademicDateRow date={makeDate()} now={now} />)

    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('DIC')).toBeInTheDocument()
    expect(screen.getByText('Inscripción a finales')).toBeInTheDocument()
    expect(screen.getByText('Ingeniería en Sistemas · Trámite')).toBeInTheDocument()
  })

  it('counts down to the close for a window', () => {
    render(<AcademicDateRow date={makeDate()} now={now} />)

    expect(screen.getByText('Cierra en 7 días')).toBeInTheDocument()
  })

  it('uses the standard relative copy for a single-day date', () => {
    render(<AcademicDateRow date={makeDate({ startsOn: '2026-11-30', endsOn: null })} now={now} />)

    expect(screen.getByText('En 2 días')).toBeInTheDocument()
  })

  // A trámite has no manual completion — it is upcoming or past by the
  // calendar — so the row deliberately carries no done-toggle, and no subject
  // colour dot either: it belongs to a carrera, not to a materia.
  it('replaces the done-toggle with a calendar-clock mark and carries no colour dot', () => {
    const { container } = render(<AcademicDateRow date={makeDate()} now={now} />)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(container.querySelector('svg.lucide-calendar-clock')).not.toBeNull()
    expect(container.querySelector('span[style*="background-color"]')).toBeNull()
  })
})
