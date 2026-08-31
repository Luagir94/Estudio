// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DiscardChangesDialog } from './discard-changes-dialog'

describe('DiscardChangesDialog', () => {
  it('states what is lost and offers the way back', () => {
    render(<DiscardChangesDialog onKeepEditing={vi.fn()} onDiscard={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Descartar cambios' })).toBeInTheDocument()
    expect(
      screen.getByText('¿Descartar los cambios? Lo que cargaste en este formulario no se guarda.')
    ).toBeInTheDocument()
    expect(screen.getByText('Seguir editando te devuelve al formulario tal como lo dejaste.')).toBeInTheDocument()
  })

  it('routes each button to its own answer', () => {
    const onKeepEditing = vi.fn()
    const onDiscard = vi.fn()
    render(<DiscardChangesDialog onKeepEditing={onKeepEditing} onDiscard={onDiscard} />)

    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(onKeepEditing).toHaveBeenCalledTimes(1)
    expect(onDiscard).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  // Escape is the safe exit on every confirm dialog in this app. On THIS one
  // the stakes are inverted from a delete dialog — the destructive answer is
  // the one that closes — so wiring Escape to it would make the panic key
  // perform the loss.
  it('keeps the form on Escape, never discards', () => {
    const onKeepEditing = vi.fn()
    const onDiscard = vi.fn()
    render(<DiscardChangesDialog onKeepEditing={onKeepEditing} onDiscard={onDiscard} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onKeepEditing).toHaveBeenCalledTimes(1)
    expect(onDiscard).not.toHaveBeenCalled()
  })
})
