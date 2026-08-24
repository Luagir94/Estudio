// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GiveUpConfirmDialog } from './GiveUpConfirmDialog'

describe('GiveUpConfirmDialog', () => {
  it('names the subject being marked reprobada', () => {
    render(<GiveUpConfirmDialog subjectName="Algoritmos" onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText(/Algoritmos/)).toBeInTheDocument()
  })

  // The whole point of this dialog: unlike the delete confirmations it
  // mirrors, giving up is NOT permanent — "Cerrar materia" stays reachable
  // afterwards and can set a different outcome. Saying "no se puede
  // deshacer" here would be false, so the copy must say the opposite.
  it('never claims the change cannot be undone, and says how to reverse it', () => {
    render(<GiveUpConfirmDialog subjectName="Algoritmos" onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.queryByText(/no se puede deshacer/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Cerrar materia/)).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<GiveUpConfirmDialog subjectName="Algoritmos" onConfirm={onConfirm} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<GiveUpConfirmDialog subjectName="Algoritmos" onConfirm={vi.fn()} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
