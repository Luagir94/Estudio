// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CliProviderStatus } from '../../../shared/ipc/cli'
import { unusableFriendlyMessage } from '../domain/connectionDisplay'
import { ConnectionStatusCard } from './ConnectionStatusCard'

const UNUSABLE_FRIENDLY_MESSAGE = unusableFriendlyMessage('claude')

function status(overrides: Partial<CliProviderStatus>): CliProviderStatus {
  return {
    provider: 'claude',
    status: 'connected',
    version: null,
    resolvedPath: null,
    source: 'auto',
    overridePath: null,
    detail: null,
    capabilities: null,
    ...overrides
  }
}

describe('ConnectionStatusCard — Status Display', () => {
  it('shows the chip, version, resolved path and origin when connected', () => {
    render(
      <ConnectionStatusCard
        onCommitPath={vi.fn()}
        status={status({
          status: 'connected',
          version: '2.1.220',
          resolvedPath: 'C:\\nvm4w\\nodejs\\claude.cmd',
          source: 'auto'
        })}
      />
    )

    expect(screen.getByText('Conectado')).toBeInTheDocument()
    expect(screen.getByText('2.1.220')).toBeInTheDocument()
    expect(screen.getByText('C:\\nvm4w\\nodejs\\claude.cmd')).toBeInTheDocument()
    expect(screen.getByText('Detección automática en el PATH')).toBeInTheDocument()
  })

  it('renders a distinct chip label for not-found than for unusable — the visible severity signal', () => {
    const { unmount } = render(<ConnectionStatusCard status={status({ status: 'not-found' })} onCommitPath={vi.fn()} />)
    expect(screen.getByText('No encontrado')).toBeInTheDocument()
    unmount()

    render(
      <ConnectionStatusCard status={status({ status: 'unusable', detail: 'exit code 1' })} onCommitPath={vi.fn()} />
    )
    expect(screen.getByText('No funciona')).toBeInTheDocument()
  })

  // Spec "Chip Color Reflects Failure Severity". The domain module's tone
  // mapping is unit-tested separately, but nothing proved this component
  // actually applies the tone: swapping two entries of CHIP_STYLES used to
  // leave the whole suite green. These assert the rendered classes.
  it.each([
    ['connected', 'Conectado', 'ok'],
    ['not-found', 'No encontrado', 'warn'],
    ['unusable', 'No funciona', 'urgent']
  ] as const)('paints the %s chip with the %s tone classes', (state, label, tone) => {
    render(<ConnectionStatusCard status={status({ status: state, detail: 'exit code 1' })} onCommitPath={vi.fn()} />)

    const chip = screen.getByText(label)
    expect(chip).toHaveClass(`border-${tone}`, `bg-${tone}-soft`, `text-${tone}`)
    expect(chip.querySelector('[aria-hidden="true"]')).toHaveClass(`bg-${tone}`)
  })

  it('shows an em dash for a null version and a null resolved path', () => {
    render(
      <ConnectionStatusCard
        status={status({ status: 'not-found', version: null, resolvedPath: null })}
        onCommitPath={vi.fn()}
      />
    )

    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('shows the override origin label when the source is a manual override', () => {
    render(
      <ConnectionStatusCard
        onCommitPath={vi.fn()}
        status={status({ status: 'connected', source: 'override', overridePath: 'C:\\claude\\claude.cmd' })}
      />
    )

    expect(screen.getByText('Ruta manual configurada')).toBeInTheDocument()
  })

  it('renders the head icon title', () => {
    render(<ConnectionStatusCard status={status({})} onCommitPath={vi.fn()} />)

    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })
})

describe('ConnectionStatusCard — Unusable Detail Copy', () => {
  it('shows the friendly Spanish message plus the exit-code detail when unusable', () => {
    render(
      <ConnectionStatusCard status={status({ status: 'unusable', detail: 'exit code 1' })} onCommitPath={vi.fn()} />
    )

    expect(screen.getByText(UNUSABLE_FRIENDLY_MESSAGE)).toBeInTheDocument()
    expect(screen.getByText('exit code 1')).toBeInTheDocument()
  })

  it('shows the technical detail verbatim, unaltered — a first-stderr-line example', () => {
    render(
      <ConnectionStatusCard
        status={status({ status: 'unusable', detail: 'Error: no se pudo leer la salida' })}
        onCommitPath={vi.fn()}
      />
    )

    expect(screen.getByText('Error: no se pudo leer la salida')).toBeInTheDocument()
  })

  it('does not show the unusable message when connected', () => {
    render(<ConnectionStatusCard status={status({ status: 'connected', version: '2.1.220' })} onCommitPath={vi.fn()} />)

    expect(screen.queryByText(UNUSABLE_FRIENDLY_MESSAGE)).not.toBeInTheDocument()
  })

  it('does not show the unusable message when not-found', () => {
    render(<ConnectionStatusCard status={status({ status: 'not-found' })} onCommitPath={vi.fn()} />)

    expect(screen.queryByText(UNUSABLE_FRIENDLY_MESSAGE)).not.toBeInTheDocument()
  })
})
