// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorSummary, type ErrorSummaryItem } from './error-summary'

function item(overrides: Partial<ErrorSummaryItem> & { id: string }): ErrorSummaryItem {
  return { group: 'General', label: 'Nombre', message: 'Poné un nombre', onGo: vi.fn(), ...overrides }
}

describe('ErrorSummary', () => {
  it('renders nothing when the form is valid', () => {
    const { container } = render(<ErrorSummary items={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('counts what is waiting and names each field with its pane', () => {
    render(
      <ErrorSummary
        items={[
          item({ id: 'name' }),
          item({ id: 'endsAt', group: 'Horario', label: 'Hora de fin', message: 'Tiene que ser posterior' })
        ]}
      />
    )

    expect(screen.getByText('Revisá 2 campos antes de guardar')).toBeInTheDocument()
    expect(screen.getByText('General · Nombre — Poné un nombre')).toBeInTheDocument()
    expect(screen.getByText('Horario · Hora de fin — Tiene que ser posterior')).toBeInTheDocument()
  })

  it('speaks singular for a single field', () => {
    render(<ErrorSummary items={[item({ id: 'name' })]} />)

    expect(screen.getByText('Revisá 1 campo antes de guardar')).toBeInTheDocument()
  })

  // The failure arrives after the user already pressed the button, and on the
  // tabbed form it can be on a pane they cannot see.
  it('announces itself and takes focus, so the list is where the user lands', () => {
    render(<ErrorSummary items={[item({ id: 'name' })]} />)

    const summary = screen.getByRole('alert')
    expect(summary).toHaveFocus()
  })

  it('sends the user to the field an item names', () => {
    const onGo = vi.fn()
    render(<ErrorSummary items={[item({ id: 'name', onGo })]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ir a Nombre' }))

    expect(onGo).toHaveBeenCalledTimes(1)
  })

  // A form with no panes has nothing to say about where a field lives.
  it('drops the pane prefix when there are no panes', () => {
    render(<ErrorSummary items={[item({ id: 'name', group: undefined })]} />)

    expect(screen.getByText('Nombre — Poné un nombre')).toBeInTheDocument()
  })
})
