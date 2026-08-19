// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SubjectDetailResult } from '../../../shared/ipc/materias'
import { EditarMateriaModal } from './EditarMateriaModal'

const subject: SubjectDetailResult = {
  id: 1,
  name: 'Algoritmos',
  code: 'ALG-101',
  color: '#7c3aed',
  docente: 'Dra. Pérez',
  contacto: null,
  campusUrl: null,
  notas: null,
  attendanceMinPercent: null,
  periodId: null,
  outcome: null,
  grade: null,
  slots: [{ id: 1, subjectId: 1, dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: 'Aula 4' }],
  deadlines: [],
  period: null,
  program: null,
  finals: []
}

describe('EditarMateriaModal', () => {
  it('renders the General tab by default, pre-filled from the subject', () => {
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByLabelText('Nombre')).toHaveValue('Algoritmos')
    expect(screen.getByLabelText('Docente')).toHaveValue('Dra. Pérez')
  })

  it('exposes campusUrl and notas fields — edit-form-only per spec "Subject Field Set"', () => {
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByLabelText('Campus virtual (URL)')).toBeInTheDocument()
    expect(screen.getByLabelText('Notas')).toBeInTheDocument()
  })

  it('switches to the Horario tab and shows the shared SlotEditor pre-filled with existing slots', () => {
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Horario' }))

    expect(screen.getByLabelText('Hora de inicio')).toHaveValue('10:00')
  })

  it('submitting without changes preserves every field (spec: "Partial edit update")', async () => {
    const onSubmit = vi.fn()
    render(<EditarMateriaModal subject={subject} onSubmit={onSubmit} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        name: 'Algoritmos',
        code: 'ALG-101',
        color: '#7c3aed',
        docente: 'Dra. Pérez',
        slots: [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: 'Aula 4' }]
      }),
      expect.anything()
    )
  })

  it('editing only notas on the General tab keeps everything else unchanged on submit', async () => {
    const onSubmit = vi.fn()
    render(<EditarMateriaModal subject={subject} onSubmit={onSubmit} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Notas'), { target: { value: 'Trae calculadora' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Algoritmos',
        docente: 'Dra. Pérez',
        notas: 'Trae calculadora'
      }),
      expect.anything()
    )
  })

  it('blocks submit and shows a validation error when name is cleared', async () => {
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('name is required')).toBeInTheDocument()
  })

  it('Cancelar calls onClose', () => {
    const onClose = vi.fn()
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Slice 3 (Horario): clicking a class block opens this modal directly on
  // the Horario tab (spec: "Editing a class routes through the subject" —
  // no direct-edit affordance on the Horario screen itself).
  it('opens on the Horario tab when initialTab="horario" is passed', () => {
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} initialTab="horario" />)

    expect(screen.getByRole('tab', { name: 'Horario' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Hora de inicio')).toHaveValue('10:00')
  })
})
