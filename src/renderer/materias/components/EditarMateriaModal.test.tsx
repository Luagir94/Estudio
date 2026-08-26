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
  comision: 'K2051',
  aula: null,
  campusUrl: null,
  groupUrl: null,
  notas: null,
  attendanceMinPercent: null,
  periodId: null,
  outcome: null,
  grade: null,
  regularity: null,
  slots: [{ id: 1, subjectId: 1, dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: 'Aula 4' }],
  deadlines: [],
  period: null,
  program: null,
  finals: [],
  parciales: [],
  attendance: [],
  classNotes: [],
  prerequisites: []
}

describe('EditarMateriaModal', () => {
  it('renders the General tab by default, pre-filled from the subject', () => {
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByLabelText('NOMBRE')).toHaveValue('Algoritmos')
    expect(screen.getByLabelText('DOCENTE')).toHaveValue('Dra. Pérez')
  })

  it('exposes campusUrl and notas fields — edit-form-only per spec "Subject Field Set"', () => {
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByLabelText('CAMPUS VIRTUAL (URL)')).toBeInTheDocument()
    expect(screen.getByLabelText('NOTAS')).toBeInTheDocument()
  })

  // Ficha de cátedra: Comisión/Aula land right after the Docente/Contacto
  // pair, and the Grupo link field after Campus — edit-form-only, same rule
  // as campusUrl/notas.
  it('exposes comisión, aula and grupo fields pre-filled from the subject', () => {
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByLabelText('COMISIÓN')).toHaveValue('K2051')
    expect(screen.getByLabelText('AULA')).toHaveValue('')
    expect(screen.getByLabelText('GRUPO (WHATSAPP / DISCORD)')).toHaveValue('')
  })

  it('submits the edited comisión, aula and grupo values', async () => {
    const onSubmit = vi.fn()
    render(<EditarMateriaModal subject={subject} onSubmit={onSubmit} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('COMISIÓN'), { target: { value: 'K2052' } })
    fireEvent.change(screen.getByLabelText('AULA'), { target: { value: 'Lab 3 · Edificio B' } })
    fireEvent.change(screen.getByLabelText('GRUPO (WHATSAPP / DISCORD)'), {
      target: { value: 'https://chat.whatsapp.com/AbC123' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        comision: 'K2052',
        aula: 'Lab 3 · Edificio B',
        groupUrl: 'https://chat.whatsapp.com/AbC123'
      }),
      expect.anything()
    )
  })

  it('switches to the Horario tab and shows the shared SlotEditor pre-filled with existing slots', () => {
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Horario' }))

    expect(screen.getByLabelText('HORA DE INICIO')).toHaveValue('10:00')
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

    fireEvent.change(screen.getByLabelText('NOTAS'), { target: { value: 'Trae calculadora' } })
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

    fireEvent.change(screen.getByLabelText('NOMBRE'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Poné un nombre')).toBeInTheDocument()
  })

  it('Cancelar calls onClose', () => {
    const onClose = vi.fn()
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Etapa 3 (Parciales y regularidad): the condición is DECLARED, never
  // derived — so the modal is where the student records what the facultad
  // ruled, and "Sin definir" is a real, reachable state, not a placeholder.
  describe('regularidad', () => {
    it('offers the four states and preselects the stored one', () => {
      render(
        <EditarMateriaModal subject={{ ...subject, regularity: 'regular' }} onSubmit={vi.fn()} onClose={vi.fn()} />
      )

      expect(screen.getByRole('button', { name: 'Sin definir' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Promocionada' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Libre' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Regular' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('preselects Sin definir when nothing was declared yet', () => {
      render(<EditarMateriaModal subject={{ ...subject, regularity: null }} onSubmit={vi.fn()} onClose={vi.fn()} />)

      expect(screen.getByRole('button', { name: 'Sin definir' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('submits the declared condición', async () => {
      const onSubmit = vi.fn()
      render(<EditarMateriaModal subject={subject} onSubmit={onSubmit} onClose={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Promocionada' }))
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ regularity: 'promocionada' }), expect.anything())
    })

    it('withdraws the condición as an explicit null, not an absent field', async () => {
      const onSubmit = vi.fn()
      render(<EditarMateriaModal subject={{ ...subject, regularity: 'libre' }} onSubmit={onSubmit} onClose={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Sin definir' }))
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ regularity: null }), expect.anything())
    })

    it('teaches that the app does not compute the condición', () => {
      render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} />)

      expect(screen.getByText(/La declarás vos/)).toBeInTheDocument()
    })
  })

  // Correlativas ride in as a SLOT because their writes are their own
  // (the `planificador:*` channels), not this form's submit — the same
  // injection-point convention SubjectDetail uses for parciales and apuntes.
  describe('correlativas slot', () => {
    it('renders the injected field after REGULARIDAD and before the divider', () => {
      render(
        <EditarMateriaModal
          subject={subject}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
          correlativasSlot={<div data-testid="correlativas-slot" />}
        />
      )

      const regularidad = screen.getByText('REGULARIDAD')
      const slot = screen.getByTestId('correlativas-slot')
      const docente = screen.getByText('DOCENTE')

      expect(regularidad.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(slot.compareDocumentPosition(docente) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('renders nothing extra when no slot is injected', () => {
      render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} />)

      expect(screen.queryByTestId('correlativas-slot')).not.toBeInTheDocument()
    })
  })

  // Slice 3 (Horario): clicking a class block opens this modal directly on
  // the Horario tab (spec: "Editing a class routes through the subject" —
  // no direct-edit affordance on the Horario screen itself).
  it('opens on the Horario tab when initialTab="horario" is passed', () => {
    render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} initialTab="horario" />)

    expect(screen.getByRole('tab', { name: 'Horario' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('HORA DE INICIO')).toHaveValue('10:00')
  })
})
