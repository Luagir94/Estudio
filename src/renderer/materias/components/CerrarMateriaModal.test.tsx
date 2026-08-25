// @vitest-environment jsdom
//
// The modal's outcome flows already live in SubjectDetailContainer.test.tsx
// ("cerrar materia"); this file owns the one behavior that needs no
// container: the stored-nota erasure warning. Switching a graded subject to
// "Final pendiente" erases its nota on purpose (the repository writes
// grade null) — the warning makes that visible, it never changes it.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CerrarMateriaModal, type ClosableSubject } from './CerrarMateriaModal'

const numericProgram = { id: 1, name: 'Abogacía', gradingScheme: 'numerico' as const, gradeScale: 10 }

const WARNING_TEXT =
  'La materia tiene una nota registrada: 7. Si la pasás a Final pendiente, esa nota se borra — el cierre definitivo va a salir de las mesas de final.'

function subject(overrides: Partial<ClosableSubject> = {}): ClosableSubject {
  return {
    id: 1,
    name: 'Algoritmos',
    outcome: null,
    grade: null,
    period: null,
    program: numericProgram,
    ...overrides
  }
}

function renderModal(overrides: Partial<ClosableSubject> = {}) {
  const handlers = { onSubmit: vi.fn(), onClose: vi.fn() }
  render(<CerrarMateriaModal subject={subject(overrides)} {...handlers} />)
  return handlers
}

describe('CerrarMateriaModal — stored-nota erasure warning', () => {
  it('warns, naming the stored nota, when "Final pendiente" is selected on a graded subject', () => {
    renderModal({ outcome: 'aprobada', grade: 7 })

    fireEvent.click(screen.getByRole('button', { name: /Final pendiente/ }))

    expect(screen.getByText(WARNING_TEXT)).toBeInTheDocument()
  })

  it('interpolates the actual stored nota into the warning', () => {
    renderModal({ outcome: 'aprobada', grade: 9.5 })

    fireEvent.click(screen.getByRole('button', { name: /Final pendiente/ }))

    expect(screen.getByText(/nota registrada: 9\.5\./)).toBeInTheDocument()
  })

  it('stays silent when the subject has no stored nota', () => {
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: /Final pendiente/ }))

    expect(screen.queryByText(/nota registrada/)).not.toBeInTheDocument()
  })

  it('stays silent on the aprobada selection even with a stored nota', () => {
    renderModal({ outcome: 'aprobada', grade: 7 })

    expect(screen.queryByText(/nota registrada/)).not.toBeInTheDocument()
  })

  it('stays silent on the reprobada selection even with a stored nota', () => {
    renderModal({ outcome: 'aprobada', grade: 7 })

    fireEvent.click(screen.getByRole('button', { name: /Reprobada/ }))

    expect(screen.queryByText(/nota registrada/)).not.toBeInTheDocument()
  })

  // The warning changes what the user SEES, never what the form sends: the
  // erasure itself is the designed behavior, so finalPendiente still submits
  // grade null.
  it('still submits grade null on finalPendiente — the warning does not change the payload', () => {
    const handlers = renderModal({ outcome: 'aprobada', grade: 7 })

    fireEvent.click(screen.getByRole('button', { name: /Final pendiente/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(handlers.onSubmit).toHaveBeenCalledWith({ id: 1, outcome: 'finalPendiente', grade: null })
  })
})
