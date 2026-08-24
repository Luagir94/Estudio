// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MateriasEmptyState } from './MateriasEmptyState'

describe('MateriasEmptyState (onboarding empty state: zero subjects loaded)', () => {
  function renderEmptyState() {
    const onAddSubject = vi.fn()
    const onGoToCarreras = vi.fn()
    const view = render(<MateriasEmptyState onAddSubject={onAddSubject} onGoToCarreras={onGoToCarreras} />)
    return { ...view, onAddSubject, onGoToCarreras }
  }

  it('renders the graduation-cap circle with the onboarding copy', () => {
    const { container } = renderEmptyState()

    expect(screen.getByText('Todavía no cargaste materias')).toBeInTheDocument()
    expect(
      screen.getByText('Creá tu primera materia, o configurá antes tu carrera y período para organizar el cuatrimestre')
    ).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-graduation-cap')).not.toBeNull()
  })

  it('fires onAddSubject from the primary CTA', () => {
    const { onAddSubject, onGoToCarreras } = renderEmptyState()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar materia' }))

    expect(onAddSubject).toHaveBeenCalledTimes(1)
    expect(onGoToCarreras).not.toHaveBeenCalled()
  })

  it('fires onGoToCarreras from the secondary CTA', () => {
    const { onAddSubject, onGoToCarreras } = renderEmptyState()

    fireEvent.click(screen.getByRole('button', { name: 'Configurar carrera' }))

    expect(onGoToCarreras).toHaveBeenCalledTimes(1)
    expect(onAddSubject).not.toHaveBeenCalled()
  })
})
