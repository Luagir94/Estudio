// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EXECUTION_WARNING } from '../domain/connectionDisplay'
import { CliProvidersCard } from './CliProvidersCard'

describe('CliProvidersCard', () => {
  it('names itself and renders the rows it is given', () => {
    render(
      <CliProvidersCard connectedCount={0} totalCount={3}>
        <p>Claude Code</p>
        <p>Codex CLI</p>
      </CliProvidersCard>
    )

    expect(screen.getByRole('heading', { name: 'CLIs detectados' })).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('Codex CLI')).toBeInTheDocument()
  })

  it('counts the connected CLIs in the singular', () => {
    render(<CliProvidersCard connectedCount={1} totalCount={3} />)

    expect(screen.getByText('Course Companion los detecta solos · 1 de 3 conectado')).toBeInTheDocument()
  })

  it('counts them in the plural', () => {
    render(<CliProvidersCard connectedCount={2} totalCount={3} />)

    expect(screen.getByText('Course Companion los detecta solos · 2 de 3 conectados')).toBeInTheDocument()
  })

  // Design D9, and the reason this card exists as a component rather than a
  // wrapper div. The app EXECUTES whatever a row's path field points at, and
  // this warning is the only compensating control that boundary has. It used
  // to be per-row, which produced three identical warnings in one viewport;
  // one card-level warning is the same guarantee without the wallpaper. There
  // is no state, no row count and no focus that may hide it.
  it('always renders the execution warning, whatever the rows say', () => {
    render(<CliProvidersCard connectedCount={3} totalCount={3} />)

    expect(screen.getByText(EXECUTION_WARNING)).toBeInTheDocument()
  })

  it('renders it even with no rows at all', () => {
    render(<CliProvidersCard connectedCount={0} totalCount={0} />)

    expect(screen.getByText(EXECUTION_WARNING)).toBeInTheDocument()
  })
})
