// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CONNECT_ACTION, PATH_INPUT_PLACEHOLDER } from '../domain/connectionDisplay'
import { IdleProviderCard } from './IdleProviderCard'

describe('IdleProviderCard', () => {
  it('names the CLI it is offering to connect', () => {
    render(<IdleProviderCard overridePath={null} provider="antigravity" onConnect={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Antigravity CLI' })).toBeInTheDocument()
  })

  // The row exists precisely so the screen can say "we did not look" instead of
  // borrowing an observation it never made. `not-found` is a RESULT; this is
  // the absence of one, and conflating them would report a missing CLI for a
  // machine nobody ever searched.
  it('claims neither a result nor its absence', () => {
    render(<IdleProviderCard overridePath={null} provider="claude" onConnect={vi.fn()} />)

    expect(screen.queryByText('Conectado')).not.toBeInTheDocument()
    expect(screen.queryByText('No encontrado')).not.toBeInTheDocument()
    expect(screen.queryByText('No funciona')).not.toBeInTheDocument()
    expect(screen.queryByText('Detección automática en el PATH')).not.toBeInTheDocument()
  })

  it('reports the connect intent only when the button is pressed', () => {
    const onConnect = vi.fn()
    render(<IdleProviderCard overridePath={null} provider="codex" onConnect={onConnect} />)

    expect(onConnect).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: `${CONNECT_ACTION} Codex CLI` }))

    expect(onConnect).toHaveBeenCalledTimes(1)
  })

  // Three rows render at once, so a bare "Conectar" would leave anyone
  // navigating by control with three indistinguishable buttons.
  it('gives the button an accessible name that includes the CLI', () => {
    render(<IdleProviderCard overridePath={null} provider="claude" onConnect={vi.fn()} />)

    expect(screen.getByRole('button', { name: `${CONNECT_ACTION} Claude Code` })).toBeInTheDocument()
  })

  // Empty field means autodetect. Reporting `''` would ask the container to
  // persist an empty override for a row the user only wanted probed.
  it('connects with a null path when the field was left empty', () => {
    const onConnect = vi.fn()
    render(<IdleProviderCard overridePath={null} provider="claude" onConnect={onConnect} />)

    fireEvent.click(screen.getByRole('button', { name: `${CONNECT_ACTION} Claude Code` }))

    expect(onConnect).toHaveBeenCalledWith(null)
  })

  // The path is offered BEFORE the first probe: someone who already knows their
  // install is off the PATH should not have to fail once to be shown the fix.
  it('connects with the typed path', () => {
    const onConnect = vi.fn()
    render(<IdleProviderCard overridePath={null} provider="claude" onConnect={onConnect} />)

    const input = screen.getByLabelText('Ruta manual del ejecutable de Claude Code')
    fireEvent.change(input, { target: { value: '  C:\\bin\\claude.cmd  ' } })
    fireEvent.blur(input)
    fireEvent.click(screen.getByRole('button', { name: `${CONNECT_ACTION} Claude Code` }))

    expect(onConnect).toHaveBeenCalledWith('C:\\bin\\claude.cmd')
  })

  it('shows the path field with the exact approved placeholder', () => {
    render(<IdleProviderCard overridePath={null} provider="claude" onConnect={vi.fn()} />)

    expect(screen.getByPlaceholderText(PATH_INPUT_PLACEHOLDER)).toBeInTheDocument()
  })
})
