// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import { ProgramCard } from './ProgramCard'

const today = new Date(2026, 7, 15)

const numericProgram: ProgramWithPeriods = {
  id: 1,
  name: 'Abogacía',
  institution: 'Universidad de Buenos Aires',
  color: '#4C8DFF',
  gradingScheme: 'numerico',
  gradeScale: 10,
  periods: [
    {
      id: 1,
      programId: 1,
      name: '1er Cuatrimestre 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-18'
    },
    {
      id: 2,
      programId: 1,
      name: '2do Cuatrimestre 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-08-12',
      endsOn: '2026-12-04'
    }
  ],
  subjectCount: 2,
  gradedSubjects: [
    { grade: 8, outcome: 'aprobada', hasApprovedFinal: false },
    { grade: 7, outcome: 'aprobada', hasApprovedFinal: false }
  ]
}

function renderCard(program: ProgramWithPeriods, onSelect?: (id: number) => void) {
  return render(<ProgramCard program={program} now={today} onSelect={onSelect} />)
}

describe('ProgramCard', () => {
  it('shows the average for a numeric program', () => {
    renderCard(numericProgram)

    expect(screen.getByText('Promedio 7.5')).toBeInTheDocument()
  })

  it('says so when a numeric program has no grades yet', () => {
    renderCard({
      ...numericProgram,
      gradedSubjects: [{ grade: null, outcome: null, hasApprovedFinal: false }]
    })

    expect(screen.getByText('Sin notas todavía')).toBeInTheDocument()
  })

  it('leaves a failed subject out of the passing tally but inside the average', () => {
    renderCard({
      ...numericProgram,
      gradedSubjects: [
        { grade: 8, outcome: 'aprobada', hasApprovedFinal: false },
        { grade: 2, outcome: 'reprobada', hasApprovedFinal: false }
      ]
    })

    expect(screen.getByText('Promedio 5')).toBeInTheDocument()
  })

  it('counts a standby subject with an approved final as passed', () => {
    renderCard({
      ...numericProgram,
      gradedSubjects: [{ grade: 6, outcome: 'finalPendiente', hasApprovedFinal: true }]
    })

    expect(screen.getByText('Promedio 6')).toBeInTheDocument()
  })

  it('shows the scheme instead of an average for a pass/fail program', () => {
    renderCard({
      ...numericProgram,
      gradingScheme: 'binario',
      gradeScale: null,
      gradedSubjects: []
    })

    expect(screen.getByText('Aprobado / Desaprobado')).toBeInTheDocument()
    expect(screen.queryByText(/Promedio/)).not.toBeInTheDocument()
  })

  it('collapses finished periods into a counter and keeps the active one visible', () => {
    renderCard(numericProgram)

    expect(screen.getByText('2do Cuatrimestre 2026')).toBeInTheDocument()
    expect(screen.queryByText('1er Cuatrimestre 2026')).not.toBeInTheDocument()
    expect(screen.getByText('1 período finalizado')).toBeInTheDocument()
  })

  it('renders an open-ended period as an open range that never finishes', () => {
    renderCard({
      ...numericProgram,
      periods: [{ id: 9, programId: 1, name: 'Clases', kind: 'clases', startsOn: '2024-03-04', endsOn: null }]
    })

    expect(screen.getByText('Desde 04 mar 2024')).toBeInTheDocument()
    expect(screen.getByLabelText('No termina')).toBeInTheDocument()
    expect(screen.queryByText(/finalizado/)).not.toBeInTheDocument()
  })

  it('summarises the subject and period counts', () => {
    renderCard(numericProgram)

    expect(screen.getByText('2 materias · 2 períodos')).toBeInTheDocument()
  })

  it('reports the selected program', async () => {
    const onSelect = vi.fn()
    renderCard(numericProgram, onSelect)

    await userEvent.click(screen.getByRole('button', { name: /Abogacía/ }))

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('omits the institution when the program has none', () => {
    renderCard({ ...numericProgram, institution: null })

    expect(screen.queryByText('Universidad de Buenos Aires')).not.toBeInTheDocument()
  })
})
