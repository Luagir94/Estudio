// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FinalExamRecord, SubjectProgram } from '../../../shared/ipc/materias'
import { AprobarFinalModal } from './AprobarFinalModal'

const numericProgram: SubjectProgram = { id: 1, name: 'Abogacía', gradingScheme: 'numerico', gradeScale: 10 }

function final(overrides: Partial<FinalExamRecord> = {}): FinalExamRecord {
  return {
    id: 3,
    subjectId: 5,
    label: '3ra mesa — Turno diciembre',
    takenOn: '2026-12-10',
    result: 'pendiente',
    grade: null,
    ...overrides
  }
}

function renderModal(overrides: Partial<FinalExamRecord> = {}) {
  const handlers = { onSubmit: vi.fn(), onClose: vi.fn() }
  render(<AprobarFinalModal final={final(overrides)} program={numericProgram} {...handlers} />)
  return handlers
}

describe('AprobarFinalModal', () => {
  it('names the mesa and its date in the subtitle', () => {
    renderModal()

    expect(screen.getByText('3ra mesa — Turno diciembre · 10 dic 2026')).toBeInTheDocument()
  })

  it('names the mesa alone while it has no date yet', () => {
    renderModal({ takenOn: null })

    expect(screen.getByText('3ra mesa — Turno diciembre')).toBeInTheDocument()
  })

  it('submits the typed nota as a number', () => {
    const handlers = renderModal()

    fireEvent.change(screen.getByLabelText(/Nota \(0 a 10\)/), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar aprobado' }))

    expect(handlers.onSubmit).toHaveBeenCalledWith(8)
  })

  // "Aprobada sin nota" is a legitimate state — the field says opcional and
  // means it.
  it('submits null when the nota is left empty', () => {
    const handlers = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Marcar aprobado' }))

    expect(handlers.onSubmit).toHaveBeenCalledWith(null)
  })

  it('pre-fills the nota already recorded on the mesa', () => {
    renderModal({ result: 'aprobado', grade: 7.5 })

    expect(screen.getByLabelText(/Nota \(0 a 10\)/)).toHaveValue(7.5)
  })

  // Same dual-call pattern as CerrarMateriaModal: the shared validateGrade
  // runs here so the user is told BEFORE submitting, and again in main at the
  // write boundary.
  it('rejects a nota over the scale with the app copy and blocks the submit', () => {
    const handlers = renderModal()

    fireEvent.change(screen.getByLabelText(/Nota \(0 a 10\)/), { target: { value: '11' } })

    expect(screen.getByText('La nota tiene que ser un número entre 0 y 10.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar aprobado' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Marcar aprobado' }))
    expect(handlers.onSubmit).not.toHaveBeenCalled()
  })

  it('cancelling closes without submitting', () => {
    const handlers = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(handlers.onClose).toHaveBeenCalledTimes(1)
    expect(handlers.onSubmit).not.toHaveBeenCalled()
  })
})
