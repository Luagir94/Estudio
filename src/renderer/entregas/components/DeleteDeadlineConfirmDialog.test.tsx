// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DeleteDeadlineConfirmDialog } from './DeleteDeadlineConfirmDialog'

describe('DeleteDeadlineConfirmDialog (spec: "Delete removes a cancelled deadline entirely, not as done")', () => {
  it('states the deadline title being deleted', () => {
    render(<DeleteDeadlineConfirmDialog deadlineTitle="Parcial 1" onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText(/Parcial 1/)).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<DeleteDeadlineConfirmDialog deadlineTitle="Parcial 1" onConfirm={onConfirm} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /eliminar entrega/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<DeleteDeadlineConfirmDialog deadlineTitle="Parcial 1" onConfirm={vi.fn()} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
