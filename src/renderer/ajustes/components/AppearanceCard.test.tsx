// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppearanceCard } from './AppearanceCard'

/**
 * The card renders TWO independent rows now. Every helper below defaults the
 * half a test is not about, so a theme assertion never has to state a palette
 * and vice versa — and neither row's props can drift into the other's tests.
 */
function renderCard(overrides: Partial<React.ComponentProps<typeof AppearanceCard>> = {}): ReturnType<typeof render> {
  return render(
    <AppearanceCard value="system" onChange={vi.fn()} palette="amatista" onPaletteChange={vi.fn()} {...overrides} />
  )
}

describe('AppearanceCard', () => {
  it('renders the approved title and description', () => {
    renderCard({ value: 'system' })

    expect(screen.getByRole('heading', { name: 'Apariencia' })).toBeInTheDocument()
    expect(screen.getByText('Claro, oscuro o lo que diga el sistema')).toBeInTheDocument()
  })

  it('offers the three themes in the approved order', () => {
    renderCard({ value: 'system' })

    const options = screen.getAllByRole('button')
    expect(options.map((option) => option.textContent)).toEqual(['Sistema', 'Claro', 'Oscuro'])
  })

  // Same segmented-control convention as `AttachmentViewer`'s Vista/Edición
  // toggle: buttons carrying `aria-pressed`, exactly one of them true.
  it('marks only the current value as pressed', () => {
    renderCard({ value: 'dark' })

    expect(screen.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the pressed option, and only then', () => {
    const onChange = vi.fn()
    renderCard({ value: 'system', onChange })

    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Claro' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('light')
  })

  // The card only READS the value it is handed — no fetching, no local copy
  // of the selection that could drift from the cache the container owns.
  it('moves the pressed marker only when the prop moves', () => {
    const { rerender } = renderCard({ value: 'system' })

    fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }))
    expect(screen.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'false')

    rerender(<AppearanceCard value="dark" onChange={vi.fn()} palette="amatista" onPaletteChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('AppearanceCard palette row', () => {
  it('renders the approved palette title and description', () => {
    renderCard()

    expect(screen.getByRole('heading', { name: 'Paleta' })).toBeInTheDocument()
    expect(screen.getByText('El color de acento y los tonos de la interfaz')).toBeInTheDocument()
  })

  // Six options is where a segmented control stops being a control, which is
  // why this row is a native <select>: full keyboard and screen-reader
  // behaviour without rebuilding a listbox by hand.
  it('offers the six palettes in the approved order', () => {
    renderCard()

    const options = screen.getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Amatista',
      'Cobalto',
      'Turquesa',
      'Cuarzo',
      'Malva',
      'Grafito'
    ])
  })

  // The visible "Paleta" heading IS the select's accessible name, rather than
  // a second label invented for screen readers that could drift from it.
  it('names the select with the visible row heading', () => {
    renderCard()

    expect(screen.getByRole('combobox', { name: 'Paleta' })).toBeInTheDocument()
  })

  it('shows the current palette as the selected option', () => {
    renderCard({ palette: 'cuarzo' })

    expect(screen.getByRole('combobox', { name: 'Paleta' })).toHaveValue('cuarzo')
  })

  it('reports the chosen palette, and only then', () => {
    const onPaletteChange = vi.fn()
    renderCard({ onPaletteChange })

    expect(onPaletteChange).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('combobox', { name: 'Paleta' }), { target: { value: 'malva' } })

    expect(onPaletteChange).toHaveBeenCalledTimes(1)
    expect(onPaletteChange).toHaveBeenCalledWith('malva')
  })

  // Same no-local-copy rule as the theme row: the selection shown is the prop,
  // so a mutation that failed leaves the select where the cache actually is.
  it('moves the selection only when the prop moves', () => {
    const { rerender } = renderCard({ palette: 'amatista' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Paleta' }), { target: { value: 'grafito' } })
    expect(screen.getByRole('combobox', { name: 'Paleta' })).toHaveValue('amatista')

    rerender(<AppearanceCard value="system" onChange={vi.fn()} palette="grafito" onPaletteChange={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Paleta' })).toHaveValue('grafito')
  })

  // The two rows are independent controls over independent axes. Touching one
  // must never report the other — that is the whole point of two settings rows
  // rather than one twelve-way control.
  it('never reports a theme change when the palette changes', () => {
    const onChange = vi.fn()
    renderCard({ onChange })

    fireEvent.change(screen.getByRole('combobox', { name: 'Paleta' }), { target: { value: 'cobalto' } })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('never reports a palette change when the theme changes', () => {
    const onPaletteChange = vi.fn()
    renderCard({ onPaletteChange })

    fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }))

    expect(onPaletteChange).not.toHaveBeenCalled()
  })
})
