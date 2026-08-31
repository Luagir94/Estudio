// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useOptionalControlled } from './useOptionalControlled'

function Widget({ value, onChange }: { value?: string; onChange?: (next: string) => void }): React.JSX.Element {
  const [current, set] = useOptionalControlled(value, onChange, 'uno')
  return (
    <button type="button" onClick={() => set('dos')}>
      {current}
    </button>
  )
}

describe('useOptionalControlled', () => {
  it('owns the state when the caller passes nothing', () => {
    render(<Widget />)

    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('uno')

    fireEvent.click(button)

    expect(button).toHaveTextContent('dos')
  })

  it('hands the state over when the caller passes both halves', () => {
    const onChange = vi.fn()
    render(<Widget value="tres" onChange={onChange} />)

    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('tres')

    fireEvent.click(button)

    // The caller decides what happens next — the widget does not move on its own.
    expect(onChange).toHaveBeenCalledWith('dos')
    expect(button).toHaveTextContent('tres')
  })

  // Either half alone is a wiring mistake. Falling back keeps the component
  // usable instead of rendering a control that cannot move.
  it('falls back to its own state when only one half arrives', () => {
    const { rerender } = render(<Widget value="tres" />)
    expect(screen.getByRole('button')).toHaveTextContent('uno')

    rerender(<Widget onChange={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('uno')
  })

  it('keeps the internal value alive across a controlled spell, so hook order never shifts', () => {
    const { rerender } = render(<Widget />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('dos')

    rerender(<Widget value="cuatro" onChange={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('cuatro')

    rerender(<Widget />)
    expect(screen.getByRole('button')).toHaveTextContent('dos')
  })
})
