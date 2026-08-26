// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SubjectPrerequisite } from '../../../shared/ipc/materias'
import { CorrelativasCard } from './CorrelativasCard'

function prerequisite(overrides: Partial<SubjectPrerequisite> & { id: number }): SubjectPrerequisite {
  return {
    subjectId: 9,
    requiredLevel: 'aprobada',
    ...overrides,
    requires: {
      id: 1,
      name: 'Álgebra I',
      outcome: null,
      regularity: null,
      finals: [],
      ...overrides.requires
    }
  }
}

describe('CorrelativasCard', () => {
  // A materia with no correlativas has nothing to say — an empty card would be
  // a heading over a blank, on a column that is already six cards tall.
  it('renders nothing when the materia has no correlativas', () => {
    const { container } = render(<CorrelativasCard prerequisites={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('heads the card', () => {
    render(<CorrelativasCard prerequisites={[prerequisite({ id: 1 })]} />)

    expect(screen.getByText('CORRELATIVAS')).toBeInTheDocument()
  })

  // The two facts are separate and stay separate: WHAT is required, and
  // WHETHER you meet it. One badge saying "Aprobada" would collapse them and
  // leave the student unable to tell a requirement from an achievement.
  it('states the required level and the verdict as two separate things', () => {
    render(
      <CorrelativasCard
        prerequisites={[
          prerequisite({
            id: 1,
            requiredLevel: 'aprobada',
            requires: { id: 1, name: 'Álgebra I', outcome: 'aprobada', regularity: null, finals: [] }
          })
        ]}
      />
    )

    const row = screen.getByTestId('correlativa-row')

    expect(within(row).getByText('Álgebra I')).toBeInTheDocument()
    expect(within(row).getByText('Requiere aprobada')).toBeInTheDocument()
    expect(within(row).getByText('Cumplida')).toBeInTheDocument()
  })

  it('reads an unmet requirement as Falta', () => {
    render(<CorrelativasCard prerequisites={[prerequisite({ id: 1, requiredLevel: 'aprobada' })]} />)

    expect(screen.getByText('Falta')).toBeInTheDocument()
  })

  it('names the regularizada level verbatim', () => {
    render(
      <CorrelativasCard
        prerequisites={[
          prerequisite({
            id: 1,
            requiredLevel: 'regularizada',
            requires: { id: 2, name: 'Análisis Matemático I', outcome: null, regularity: 'regular', finals: [] }
          })
        ]}
      />
    )

    expect(screen.getByText('Requiere regularizada')).toBeInTheDocument()
    expect(screen.getByText('Cumplida')).toBeInTheDocument()
  })

  // The card asks the SAME domain rule the Planificador does, so a materia can
  // never read Cumplida here and block the draft two screens away.
  it('honours the aprobada-implies-regularizada rule', () => {
    render(
      <CorrelativasCard
        prerequisites={[
          prerequisite({
            id: 1,
            requiredLevel: 'regularizada',
            requires: { id: 2, name: 'Análisis Matemático I', outcome: 'aprobada', regularity: null, finals: [] }
          })
        ]}
      />
    )

    expect(screen.getByText('Cumplida')).toBeInTheDocument()
  })

  it('resolves a final pendiente through its mesas', () => {
    render(
      <CorrelativasCard
        prerequisites={[
          prerequisite({
            id: 1,
            requiredLevel: 'aprobada',
            requires: {
              id: 2,
              name: 'Análisis Matemático I',
              outcome: 'finalPendiente',
              regularity: null,
              finals: [{ result: 'aprobado' }]
            }
          })
        ]}
      />
    )

    expect(screen.getByText('Cumplida')).toBeInTheDocument()
  })

  it('lists every correlativa', () => {
    render(
      <CorrelativasCard
        prerequisites={[
          prerequisite({
            id: 1,
            requires: { id: 1, name: 'Álgebra I', outcome: 'aprobada', regularity: null, finals: [] }
          }),
          prerequisite({
            id: 2,
            requiredLevel: 'regularizada',
            requires: { id: 2, name: 'Análisis Matemático I', outcome: null, regularity: null, finals: [] }
          })
        ]}
      />
    )

    expect(screen.getAllByTestId('correlativa-row')).toHaveLength(2)
    expect(screen.getByText('Cumplida')).toBeInTheDocument()
    expect(screen.getByText('Falta')).toBeInTheDocument()
  })
})
