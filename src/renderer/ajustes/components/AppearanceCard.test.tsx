// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppearanceCard } from './AppearanceCard'

describe('AppearanceCard', () => {
  it('renders the approved title and description', () => {
    render(<AppearanceCard value="system" onChange={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Apariencia' })).toBeInTheDocument()
    expect(screen.getByText('Elegí el tema de la aplicación')).toBeInTheDocument()
  })

  it('offers the three themes in the approved order', () => {
    render(<AppearanceCard value="system" onChange={vi.fn()} />)

    const options = screen.getAllByRole('button')
    expect(options.map((option) => option.textContent)).toEqual(['Sistema', 'Claro', 'Oscuro'])
  })

  // Same segmented-control convention as `AttachmentViewer`'s Vista/Edición
  // toggle: buttons carrying `aria-pressed`, exactly one of them true.
  it('marks only the current value as pressed', () => {
    render(<AppearanceCard value="dark" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the pressed option, and only then', () => {
    const onChange = vi.fn()
    render(<AppearanceCard value="system" onChange={onChange} />)

    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Claro' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('light')
  })

  // The card only READS the value it is handed — no fetching, no local copy
  // of the selection that could drift from the cache the container owns.
  it('moves the pressed marker only when the prop moves', () => {
    const { rerender } = render(<AppearanceCard value="system" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }))
    expect(screen.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'false')

    rerender(<AppearanceCard value="dark" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true')
  })
})
