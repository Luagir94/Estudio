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

  error?: string | null
  onSubmit?: (values: { status: AttendanceStatus | null }) => void
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
    it('submits the mark it was given', async () => {
      const { onSubmit } = renderModal()

      await userEvent.click(screen.getByRole('button', { name: 'Presente' }))
      await userEvent.click(screen.getByRole('button', { name: 'Guardar asistencia' }))

      expect(onSubmit).toHaveBeenCalledWith({ status: 'presente' })
    })

    it('prefills the mark the class already carries', async () => {
      const { onSubmit } = renderModal({ attendanceStatus: 'ausente' })

      await userEvent.click(screen.getByRole('button', { name: 'Guardar asistencia' }))

      expect(onSubmit).toHaveBeenCalledWith({ status: 'ausente' })
    })

    // Clicking the pressed option clears the mark, exactly as the row's toggle
    // pair does — there is no separate "sin marcar" option to hunt for.
    it('clears the mark by pressing the active option again', async () => {
      const { onSubmit } = renderModal({ attendanceStatus: 'presente' })

      await userEvent.click(screen.getByRole('button', { name: 'Presente' }))
      await userEvent.click(screen.getByRole('button', { name: 'Guardar asistencia' }))

      expect(onSubmit).toHaveBeenCalledWith({ status: null })
    })

    /*
     * THE boundary this dialog now holds. An apunte is a markdown document
     * with its own editor and its own save; if a textarea ever reappeared
     * here there would be two surfaces writing one apunte, and the last one
     * to save would silently win. There is no field to find because there is
     * no second writer.
     */
    it('offers no way to write an apunte', () => {
      renderModal({ attendanceStatus: 'presente' })

      expect(screen.queryByLabelText('APUNTE DE LA CLASE')).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('never reports an apunte on what it submits', async () => {
      const { onSubmit } = renderModal()

      await userEvent.click(screen.getByRole('button', { name: 'Guardar asistencia' }))

      // Exact-argument matching, so a stray `body` key would fail this.
      expect(onSubmit).toHaveBeenCalledWith({ status: null })
    })
  })

  it('states the effect of marking and the one-per-class contract', () => {
    renderModal()

    expect(screen.getByText('Marcar la clase actualiza el porcentaje de asistencia de la materia.')).toBeInTheDocument()
    expect(screen.getByText('Una marca por clase')).toBeInTheDocument()
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
