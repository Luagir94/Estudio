// @vitest-environment jsdom
//
// The modal's outcome flows already live in SubjectDetailContainer.test.tsx
// ("cerrar materia"); this file owns the behaviors that need no container:
// the stored-nota erasure warning, the no-pre-selection rule for undecided
// subjects, the "Reabrir" option on already-decided ones, and the
// replace-existing notice. Switching a graded subject to "Final pendiente"
// erases its nota on purpose (the repository writes grade null) — the
// warning makes that visible, it never changes it.
import { fireEvent, render, screen, within } from '@testing-library/react'
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

// An undecided subject must never open one click away from a wrong closure:
// nothing is pre-selected, and the form refuses to save until the student
// says how the cursada actually ended.
describe('CerrarMateriaModal — undecided subject starts with nothing selected', () => {
  const NEUTRAL_PROMPT = 'Elegí cómo terminó la cursada para poder guardar.'

  it('pre-selects no outcome', () => {
    renderModal()

    for (const name of [/^Aprobada/, /^Final pendiente/, /^Reprobada/]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('disables Guardar, hides the nota field, and shows the neutral prompt', () => {
    renderModal()

    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    expect(screen.queryByLabelText(/NOTA/)).not.toBeInTheDocument()
    expect(screen.getByText(NEUTRAL_PROMPT)).toBeInTheDocument()
  })

  it('offers no reopen option — there is no closure to erase yet', () => {
    renderModal()

    expect(screen.queryByRole('button', { name: /Reabrir/ })).not.toBeInTheDocument()
  })

  it('selecting an outcome enables Guardar and clears the prompt', () => {
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: /^Aprobada/ }))

    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
    expect(screen.queryByText(NEUTRAL_PROMPT)).not.toBeInTheDocument()
  })

  it('keeps the stored selection seeded when the subject already has an outcome', () => {
    renderModal({ outcome: 'reprobada' })

    expect(screen.getByRole('button', { name: /^Reprobada/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })
})

// "Reabrir" undoes a recorded outcome (the repository clears outcome AND
// grade); it exists only once there IS something to undo, and it renders
// FIRST so the escape hatch is never buried under the three closures.
describe('CerrarMateriaModal — reopen option', () => {
  it('renders first in the options list when the subject has an outcome', () => {
    renderModal({ outcome: 'aprobada', grade: 8 })

    const options = within(screen.getByRole('group')).getAllByRole('button')

    expect(options).toHaveLength(4)
    expect(options[0]).toHaveAccessibleName(/Reabrir — sigue en curso/)
  })

  it('explains where the subject goes back to', () => {
    renderModal({ outcome: 'aprobada' })

    expect(
      screen.getByText('Borra el cierre y vuelve a Cursando (o Sin cerrar si el período ya terminó).')
    ).toBeInTheDocument()
  })

  it('selecting it on a closed graded subject warns the closure and its nota go', () => {
    renderModal({ outcome: 'aprobada', grade: 8 })

    fireEvent.click(screen.getByRole('button', { name: /Reabrir/ }))

    expect(
      screen.getByText('La materia está cerrada como Aprobada · 8. Reabrirla borra ese cierre y su nota.')
    ).toBeInTheDocument()
  })

  it('selecting it on a closed ungraded subject warns only the closure goes', () => {
    renderModal({ outcome: 'reprobada' })

    fireEvent.click(screen.getByRole('button', { name: /Reabrir/ }))

    expect(screen.getByText('La materia está cerrada como Reprobada. Reabrirla borra ese cierre.')).toBeInTheDocument()
  })

  it('selecting it on a final-pendiente subject explains the mesas survive', () => {
    renderModal({ outcome: 'finalPendiente' })

    fireEvent.click(screen.getByRole('button', { name: /Reabrir/ }))

    expect(
      screen.getByText(
        'La materia está en Final pendiente. Reabrirla la vuelve a En curso; las mesas cargadas se conservan por si volvés a Final pendiente.'
      )
    ).toBeInTheDocument()
  })

  it('hides the nota field while reopen is selected', () => {
    renderModal({ outcome: 'aprobada', grade: 8 })

    fireEvent.click(screen.getByRole('button', { name: /Reabrir/ }))

    expect(screen.queryByLabelText(/NOTA/)).not.toBeInTheDocument()
  })

  it('submits outcome null and grade null', () => {
    const handlers = renderModal({ outcome: 'aprobada', grade: 8 })

    fireEvent.click(screen.getByRole('button', { name: /Reabrir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(handlers.onSubmit).toHaveBeenCalledWith({ id: 1, outcome: null, grade: null })
  })
})

// Overwriting a recorded closure is legal (setOutcome always overwrites) but
// must never be silent: picking a DIFFERENT non-reopen outcome names what is
// being replaced. The warn-styled messages (erasure, reopen) keep priority
// over this notice in the single note area.
describe('CerrarMateriaModal — replace-existing notice', () => {
  it('names the current closure and its nota when a different outcome is selected', () => {
    renderModal({ outcome: 'aprobada', grade: 8 })

    fireEvent.click(screen.getByRole('button', { name: /^Reprobada/ }))

    expect(screen.getByText('Reemplaza el cierre actual: Aprobada · 8')).toBeInTheDocument()
  })

  it('omits the nota when none is stored', () => {
    renderModal({ outcome: 'aprobada' })

    fireEvent.click(screen.getByRole('button', { name: /^Reprobada/ }))

    expect(screen.getByText('Reemplaza el cierre actual: Aprobada')).toBeInTheDocument()
  })

  it('stays silent while the selected outcome IS the current one', () => {
    renderModal({ outcome: 'aprobada', grade: 8 })

    expect(screen.queryByText(/Reemplaza el cierre actual/)).not.toBeInTheDocument()
  })

  it('yields to the stored-nota erasure warning on finalPendiente', () => {
    renderModal({ outcome: 'aprobada', grade: 7 })

    fireEvent.click(screen.getByRole('button', { name: /Final pendiente/ }))

    expect(screen.getByText(WARNING_TEXT)).toBeInTheDocument()
    expect(screen.queryByText(/Reemplaza el cierre actual/)).not.toBeInTheDocument()
  })
})
