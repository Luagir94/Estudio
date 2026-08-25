// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AttendanceStatus } from '../../../shared/ipc/materias'
import type { ClassSlotLike } from '../domain/classOccurrence'
import { ClaseModal } from './ClaseModal'

const thursdayMorning: ClassSlotLike = { dayOfWeek: 4, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }

interface ModalOverrides {
  date?: string
  occurrence?: ClassSlotLike | null
  attendanceStatus?: AttendanceStatus | null
  noteBody?: string
  error?: string | null
  onSubmit?: (values: { status: AttendanceStatus | null; body: string }) => void
  onClose?: () => void
}

function renderModal(overrides: ModalOverrides = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn()
  const onClose = overrides.onClose ?? vi.fn()
  render(
    <ClaseModal
      subjectName="Sistemas Operativos"
      date={overrides.date ?? '2026-08-13'}
      occurrence={overrides.occurrence === undefined ? thursdayMorning : overrides.occurrence}
      attendanceStatus={overrides.attendanceStatus ?? null}
      noteBody={overrides.noteBody ?? ''}
      error={overrides.error ?? null}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  )
  return { onSubmit, onClose }
}

describe('ClaseModal (approved design — one surface per materia + fecha)', () => {
  it('names the class by its date and its resolved occurrence', () => {
    renderModal()

    expect(screen.getByRole('dialog', { name: 'Clase del jueves 13 de agosto' })).toBeInTheDocument()
    expect(screen.getByText('Sistemas Operativos · 08:00 – 09:30 · Aula 204')).toBeInTheDocument()
  })

  // The occurrence is composed from the weekly pattern at READ time, so an
  // edited horario can leave it unresolvable. The mark and the apunte survive
  // (they are anchored to the day) — only the time and the aula are unknown,
  // and the subtitle says only what it knows instead of inventing a time.
  it('falls back to the subject alone when the schedule no longer covers the date', () => {
    renderModal({ occurrence: null })

    expect(screen.getByText('Sistemas Operativos')).toBeInTheDocument()
    expect(screen.queryByText(/08:00/)).not.toBeInTheDocument()
  })

  it('omits the aula when the slot has none, without a dangling separator', () => {
    renderModal({ occurrence: { ...thursdayMorning, location: null } })

    expect(screen.getByText('Sistemas Operativos · 08:00 – 09:30')).toBeInTheDocument()
  })

  describe('asistencia', () => {
    it('offers the three marks, none pressed on an unmarked class', () => {
      renderModal()

      for (const label of ['Presente', 'Ausente', 'Feriado']) {
        expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
      }
    })

    it('presses the stored mark', () => {
      renderModal({ attendanceStatus: 'feriado' })

      expect(screen.getByRole('button', { name: 'Feriado' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Presente' })).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('saving', () => {
    // One "Guardar clase" writes BOTH halves of the class — that is what makes
    // this one surface instead of two.
    it('submits the mark and the apunte together', async () => {
      const { onSubmit } = renderModal()

      await userEvent.click(screen.getByRole('button', { name: 'Presente' }))
      await userEvent.type(screen.getByLabelText('APUNTE DE LA CLASE'), 'Round robin y starvation.')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }))

      expect(onSubmit).toHaveBeenCalledWith({ status: 'presente', body: 'Round robin y starvation.' })
    })

    it('prefills what the class already carries', async () => {
      const { onSubmit } = renderModal({ attendanceStatus: 'ausente', noteBody: 'Falté, pedir apuntes.' })

      expect(screen.getByLabelText('APUNTE DE LA CLASE')).toHaveValue('Falté, pedir apuntes.')

      await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }))

      expect(onSubmit).toHaveBeenCalledWith({ status: 'ausente', body: 'Falté, pedir apuntes.' })
    })

    // Clicking the pressed option clears the mark, exactly as the row's toggle
    // pair does — there is no separate "sin marcar" option to hunt for.
    it('clears the mark by pressing the active option again', async () => {
      const { onSubmit } = renderModal({ attendanceStatus: 'presente' })

      await userEvent.click(screen.getByRole('button', { name: 'Presente' }))
      await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }))

      expect(onSubmit).toHaveBeenCalledWith({ status: null, body: '' })
    })

    // An emptied apunte is a DELETED apunte — the container turns the empty
    // body into `clases:deleteNote`.
    it('submits an empty body when the apunte is cleared', async () => {
      const { onSubmit } = renderModal({ noteBody: 'Sobra.' })

      await userEvent.clear(screen.getByLabelText('APUNTE DE LA CLASE'))
      await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }))

      expect(onSubmit).toHaveBeenCalledWith({ status: null, body: '' })
    })

    it('refuses an apunte past the cap and says so in Spanish', async () => {
      const { onSubmit } = renderModal()

      const textarea = screen.getByLabelText('APUNTE DE LA CLASE')
      await userEvent.click(textarea)
      // `type` would emit 20 001 keystrokes; the field's value is what the
      // resolver reads.
      await userEvent.paste('a'.repeat(20001))
      await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }))

      expect(await screen.findByText('El apunte no puede superar los 20.000 caracteres')).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  it('states the effect of marking and the one-per-class contract', () => {
    renderModal()

    expect(screen.getByText('Marcar la clase actualiza el porcentaje de asistencia de la materia.')).toBeInTheDocument()
    expect(screen.getByText('Una marca y un apunte por clase')).toBeInTheDocument()
  })

  it('shows the failure in place of the footer note when a write did not go through', () => {
    renderModal({ error: 'No se pudo guardar' })

    expect(screen.getByText('No se pudo guardar')).toBeInTheDocument()
    expect(screen.queryByText('Una marca y un apunte por clase')).not.toBeInTheDocument()
  })

  it('closes from Cancelar without writing', async () => {
    const { onClose, onSubmit } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
