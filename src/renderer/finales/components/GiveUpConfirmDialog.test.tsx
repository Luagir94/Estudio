// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SubjectProgram } from '../../../shared/ipc/materias'
import { GiveUpConfirmDialog } from './GiveUpConfirmDialog'

const numericProgram: SubjectProgram = { id: 1, name: 'Abogacía', gradingScheme: 'numerico', gradeScale: 10 }
const binaryProgram: SubjectProgram = { id: 2, name: 'Curso', gradingScheme: 'binario', gradeScale: null }

function renderDialog(program: SubjectProgram | null = null) {
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn() }
  render(<GiveUpConfirmDialog subjectName="Algoritmos" program={program} {...handlers} />)
  return handlers
}

describe('GiveUpConfirmDialog', () => {
  it('names the subject being marked reprobada', () => {
    renderDialog()

    expect(screen.getByText(/Algoritmos/)).toBeInTheDocument()
  })

  // The whole point of this dialog: unlike the delete confirmations it
  // mirrors, giving up is NOT permanent — "Cerrar materia" stays reachable
  // afterwards and can set a different outcome. Saying "no se puede
  // deshacer" here would be false, so the copy must say the opposite.
  it('never claims the change cannot be undone, and says how to reverse it', () => {
    renderDialog()

    expect(screen.queryByText(/no se puede deshacer/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Cerrar materia/)).toBeInTheDocument()
  })

  it('calls onConfirm with no aplazo when the confirm button is clicked', () => {
    const handlers = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))

    expect(handlers.onConfirm).toHaveBeenCalledTimes(1)
    expect(handlers.onConfirm).toHaveBeenCalledWith(null)
  })

  it('calls onCancel when the cancel button is clicked', () => {
    const handlers = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(handlers.onCancel).toHaveBeenCalledTimes(1)
  })
})

// Under a 'numerico' program the dialog offers an OPTIONAL aplazo: the give
// up used to hardcode grade null, silently dropping a number the student may
// well have — an aplazo counts in the "promedio con aplazos".
describe('GiveUpConfirmDialog — aplazo opcional', () => {
  it('offers the aplazo field, the info note and the footer hint under a numeric program', () => {
    renderDialog(numericProgram)

    expect(screen.getByLabelText(/APLAZO \(0 A 10\) · OPCIONAL/)).toBeInTheDocument()
    expect(
      screen.getByText(
        'El aplazo cuenta en el promedio con aplazos. Si lo dejás vacío, la materia queda Reprobada sin nota.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('Podés cambiarlo después')).toBeInTheDocument()
  })

  it('confirming sends the typed aplazo as a number', () => {
    const handlers = renderDialog(numericProgram)

    fireEvent.change(screen.getByLabelText(/APLAZO \(0 A 10\)/), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))

    expect(handlers.onConfirm).toHaveBeenCalledWith(2)
  })

  // "Reprobada sin nota" is a legitimate state — the field says opcional and
  // means it.
  it('confirming with the field empty sends null', () => {
    const handlers = renderDialog(numericProgram)

    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))

    expect(handlers.onConfirm).toHaveBeenCalledWith(null)
  })

  // Same dual-call pattern as CerrarMateriaModal: the shared validateGrade
  // runs here so the user is told BEFORE confirming, and again in main at
  // the write boundary.
  it('rejects an aplazo over the scale with the app copy and blocks the confirm', () => {
    const handlers = renderDialog(numericProgram)

    fireEvent.change(screen.getByLabelText(/APLAZO \(0 A 10\)/), { target: { value: '11' } })

    expect(screen.getByText('La nota tiene que ser un número entre 0 y 10.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Darla por reprobada' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))
    expect(handlers.onConfirm).not.toHaveBeenCalled()
  })

  it('offers no field under a pass/fail program and confirms with null', () => {
    const handlers = renderDialog(binaryProgram)

    expect(screen.queryByLabelText(/APLAZO/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))

    expect(handlers.onConfirm).toHaveBeenCalledWith(null)
  })

  it('offers no field when the subject has no program', () => {
    renderDialog(null)

    expect(screen.queryByLabelText(/APLAZO/)).not.toBeInTheDocument()
  })
})
