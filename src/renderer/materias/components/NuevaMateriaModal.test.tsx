// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import { NuevaMateriaModal } from './NuevaMateriaModal'

// A subject is always created inside a period, so the form is only usable
// when at least one exists.
const programs: ProgramWithPeriods[] = [
  {
    id: 1,
    name: 'Abogacía',
    institution: null,
    color: '#4C8DFF',
    gradingScheme: 'numerico',
    gradeScale: 10,
    periods: [
      {
        id: 7,
        programId: 1,
        name: '1er Cuatrimestre 2026',
        kind: 'cuatrimestre',
        startsOn: '2026-03-09',
        endsOn: '2026-07-18'
      }
    ],
    subjectCount: 0,
    gradedSubjects: []
  }
]

describe('NuevaMateriaModal', () => {
  it('submits successfully with only the required fields plus one schedule slot', async () => {
    const onSubmit = vi.fn()
    render(<NuevaMateriaModal programs={programs} defaultPeriodId={7} onSubmit={onSubmit} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Algoritmos' } })
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'ALG-101' } })
    fireEvent.click(screen.getByRole('button', { name: 'Color #A78BFA' }))
    // docente/contacto left blank on purpose (spec: "Create subject with
    // only required fields")
    fireEvent.click(screen.getByRole('button', { name: 'Agregar horario' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear materia' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const [submitted] = onSubmit.mock.calls[0] as [Record<string, unknown>]
    expect(submitted).toMatchObject({ name: 'Algoritmos', code: 'ALG-101', color: '#A78BFA' })
    expect(submitted.slots).toHaveLength(1)
  })

  it('does not submit when name is missing and a slot is missing', async () => {
    const onSubmit = vi.fn()
    render(<NuevaMateriaModal programs={programs} defaultPeriodId={7} onSubmit={onSubmit} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'ALG-101' } })
    fireEvent.click(screen.getByRole('button', { name: 'Color #A78BFA' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear materia' }))

    await waitFor(() => expect(screen.getByText('name is required')).toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onClose when the cancel button is clicked', () => {
    const onClose = vi.fn()
    render(<NuevaMateriaModal programs={programs} defaultPeriodId={7} onSubmit={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
