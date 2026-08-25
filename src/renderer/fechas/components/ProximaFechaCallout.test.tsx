// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AcademicDateWithProgram } from '../../../shared/ipc/fechas'
import { ProximaFechaCallout } from './ProximaFechaCallout'

const now = new Date(2026, 11, 2, 9, 0)

function makeDate(overrides: Partial<AcademicDateWithProgram> = {}): AcademicDateWithProgram {
  return {
    id: 1,
    programId: 2,
    title: 'Inscripción a finales',
    kind: 'inscripcionFinales',
    startsOn: '2026-12-01',
    endsOn: '2026-12-05',
    programName: 'Abogacía',
    ...overrides
  }
}

describe('ProximaFechaCallout (approved design: the warn callout above Hoy deadlines)', () => {
  it('names what closes, when, and for which carrera', () => {
    render(<ProximaFechaCallout date={makeDate()} now={now} />)

    expect(screen.getByText('Inscripción a finales — cierra en 3 días')).toBeInTheDocument()
    expect(screen.getByText('Del 1 al 5 de diciembre · Abogacía')).toBeInTheDocument()
  })

  it('uses the standard relative copy for a single-day date', () => {
    render(<ProximaFechaCallout date={makeDate({ startsOn: '2026-12-03', endsOn: null })} now={now} />)

    expect(screen.getByText('Inscripción a finales — mañana')).toBeInTheDocument()
    expect(screen.getByText('El 3 de diciembre · Abogacía')).toBeInTheDocument()
  })

  it('carries the warn treatment, never the interaction accent', () => {
    const { container } = render(<ProximaFechaCallout date={makeDate()} now={now} />)

    expect(container.firstElementChild?.className).toContain('warn')
    expect(container.querySelector('svg.lucide-calendar-clock')).not.toBeNull()
  })
})
