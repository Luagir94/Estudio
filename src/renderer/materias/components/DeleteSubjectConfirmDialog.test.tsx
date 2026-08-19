// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DeleteSubjectConfirmDialog } from './DeleteSubjectConfirmDialog'

describe('DeleteSubjectConfirmDialog', () => {
  it('states the exact deadline count that will also be destroyed (spec: "Confirmation states the deadline count")', () => {
    render(
      <DeleteSubjectConfirmDialog subjectName="Algoritmos" deadlineCount={7} onConfirm={vi.fn()} onCancel={vi.fn()} />
    )

    expect(screen.getByText(/7/)).toBeInTheDocument()
    expect(screen.getByText(/entregas/i)).toBeInTheDocument()
  })

  it('shows no misleading deadline count for a subject with zero deadlines (spec: "Zero-deadline subject shows no misleading count")', () => {
    render(
      <DeleteSubjectConfirmDialog subjectName="Algoritmos" deadlineCount={0} onConfirm={vi.fn()} onCancel={vi.fn()} />
    )

    expect(screen.queryByText(/se eliminarán \d+ entrega/i)).not.toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(
      <DeleteSubjectConfirmDialog subjectName="Algoritmos" deadlineCount={3} onConfirm={onConfirm} onCancel={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(
      <DeleteSubjectConfirmDialog subjectName="Algoritmos" deadlineCount={3} onConfirm={vi.fn()} onCancel={onCancel} />
    )

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
