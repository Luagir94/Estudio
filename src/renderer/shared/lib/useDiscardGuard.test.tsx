// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useDiscardGuard } from './useDiscardGuard'

function Form({ dirty, onClose }: { dirty: boolean; onClose: () => void }): React.JSX.Element {
  const guard = useDiscardGuard({ isDirty: () => dirty, onClose })
  return (
    <div>
      <p>{`confirming:${guard.isConfirming}`}</p>
      <p>{`dismiss:${guard.onDismiss === undefined ? 'inert' : 'armed'}`}</p>
      <button type="button" onClick={guard.requestClose}>
        cerrar
      </button>
      <button type="button" onClick={guard.keepEditing}>
        seguir
      </button>
      <button type="button" onClick={guard.discard}>
        descartar
      </button>
    </div>
  )
}

describe('useDiscardGuard', () => {
  // A form nobody touched has nothing to lose. Making it ask anyway would
  // train the user to dismiss the question without reading it, which is
  // exactly how a guard stops guarding.
  it('closes straight through when the form is untouched', () => {
    const onClose = vi.fn()
    render(<Form dirty={false} onClose={onClose} />)

    fireEvent.click(screen.getByText('cerrar'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByText('confirming:false')).toBeInTheDocument()
  })

  it('asks first when there is typed input to lose', () => {
    const onClose = vi.fn()
    render(<Form dirty onClose={onClose} />)

    fireEvent.click(screen.getByText('cerrar'))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('confirming:true')).toBeInTheDocument()
  })

  it('keeps the form alive when the answer is "seguir editando"', () => {
    const onClose = vi.fn()
    render(<Form dirty onClose={onClose} />)

    fireEvent.click(screen.getByText('cerrar'))
    fireEvent.click(screen.getByText('seguir'))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('confirming:false')).toBeInTheDocument()
  })

  it('closes once when the answer is "descartar"', () => {
    const onClose = vi.fn()
    render(<Form dirty onClose={onClose} />)

    fireEvent.click(screen.getByText('cerrar'))
    fireEvent.click(screen.getByText('descartar'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Both dialogs mount at once — the form stays alive behind the question, or
  // "seguir editando" would return to an empty form and the guard would cause
  // the very loss it exists to prevent. Both would also hear the same Escape,
  // so while the question is up the FORM's Escape has to go inert and let the
  // question own it.
  it('hands Escape to the question while the question is up', () => {
    render(<Form dirty onClose={vi.fn()} />)
    expect(screen.getByText('dismiss:armed')).toBeInTheDocument()

    fireEvent.click(screen.getByText('cerrar'))

    expect(screen.getByText('dismiss:inert')).toBeInTheDocument()
  })
})
