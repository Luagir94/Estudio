// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CliProviderStatus } from '../../../shared/ipc/cli'
import {
  executionWarningCopy,
  INERT_MESSAGE,
  PATH_INPUT_PLACEHOLDER,
  RETRY_ACTION,
  unusableFriendlyMessage
} from '../domain/connectionDisplay'
import { ConnectionStatusCard } from './ConnectionStatusCard'

const UNUSABLE_FRIENDLY_MESSAGE = unusableFriendlyMessage('claude')

const ALL_CAPABLE = { structuredOutput: true, warmSession: true, readOnlyTools: true }

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

function renderCard(overrides: Partial<CliProviderStatus>, props: Partial<{ isReprobing: boolean }> = {}) {
  const onCommitPath = vi.fn()
  const onReprobe = vi.fn()
  const onDisconnect = vi.fn()
  render(
    <ConnectionStatusCard
      status={status(overrides)}
      onCommitPath={onCommitPath}
      onReprobe={onReprobe}
      onDisconnect={onDisconnect}
      isReprobing={props.isReprobing ?? false}
    />
  )
  return { onCommitPath, onReprobe, onDisconnect }
}

// The row the user sees most often, and the reason the card was compacted: a
// CLI that works raises no questions, so it answers none.
describe('ConnectionStatusCard — healthy row collapses to one line', () => {
  it('shows the chip and nothing else when connected, autodetected and fully capable', () => {
    renderCard({
      status: 'connected',
      version: '2.1.220',
      resolvedPath: 'C:\\x\\claude.cmd',
      capabilities: ALL_CAPABLE
    })

    expect(screen.getByText('Conectado')).toBeInTheDocument()
    // Version, executable, origin and the capability rows are all gone.
    expect(screen.queryByText('2.1.220')).not.toBeInTheDocument()
    expect(screen.queryByText('C:\\x\\claude.cmd')).not.toBeInTheDocument()
    expect(screen.queryByText('Detección automática en el PATH')).not.toBeInTheDocument()
    expect(screen.queryByText('Respuestas estructuradas')).not.toBeInTheDocument()
  })

  // Design D9's converse: no field, no warning. The warning exists to disclose
  // an execution the field invites, so showing it with nothing to type would be
  // alarming the user about a risk this row does not carry.
  it('shows neither the path field nor the execution warning', () => {
    renderCard({ status: 'connected', capabilities: ALL_CAPABLE })

    expect(screen.queryByPlaceholderText(PATH_INPUT_PLACEHOLDER)).not.toBeInTheDocument()
    expect(screen.queryByText(executionWarningCopy('claude'))).not.toBeInTheDocument()
  })
})

// Collapsing to one line removed every other control, so the chip had to become
// one. A row that cannot be re-checked starts lying the moment the user
// upgrades their install.
describe('ConnectionStatusCard — the chip is the re-probe control', () => {
  it('reports the re-probe intent only when the chip is pressed', () => {
    const { onReprobe } = renderCard({ status: 'connected', capabilities: ALL_CAPABLE })

    expect(onReprobe).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: `${RETRY_ACTION} Claude Code` }))

    expect(onReprobe).toHaveBeenCalledTimes(1)
  })

  it('names the CLI in the accessible name, so three rows are distinguishable', () => {
    renderCard({ provider: 'codex', status: 'connected', capabilities: ALL_CAPABLE })

    expect(screen.getByRole('button', { name: `${RETRY_ACTION} Codex CLI` })).toBeInTheDocument()
  })

  // The row keeps its previous values during a re-probe — they are still the
  // last thing actually observed — so the chip is the only honest place left to
  // say that work is in flight.
  it('marks the chip busy and disabled while its re-probe runs', () => {
    renderCard({ status: 'connected', capabilities: ALL_CAPABLE }, { isReprobing: true })

    const chip = screen.getByRole('button', { name: `${RETRY_ACTION} Claude Code` })
    expect(chip).toHaveAttribute('aria-busy', 'true')
    expect(chip).toBeDisabled()
  })
})

describe('ConnectionStatusCard — Status Display', () => {
  it('renders a distinct chip label for not-found than for unusable — the visible severity signal', () => {
    const { unmount } = render(
      <ConnectionStatusCard
        status={status({ status: 'not-found' })}
        onCommitPath={vi.fn()}
        onReprobe={vi.fn()}
        onDisconnect={vi.fn()}
        isReprobing={false}
      />
    )
    expect(screen.getByText('No encontrado')).toBeInTheDocument()
    unmount()

    renderCard({ status: 'unusable', detail: 'exit code 1' })
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
    renderCard({ status: state, detail: 'exit code 1', capabilities: state === 'connected' ? ALL_CAPABLE : null })

    const chip = screen.getByText(label, { selector: 'button' })
    expect(chip).toHaveClass(`border-${tone}`, `bg-${tone}-soft`, `text-${tone}`)
  })

  it('renders the CLI name', () => {
    renderCard({ capabilities: ALL_CAPABLE })

    expect(screen.getByRole('heading', { name: 'Claude Code' })).toBeInTheDocument()
  })
})

describe('ConnectionStatusCard — Unusable Detail Copy', () => {
  it('shows the friendly Spanish message plus the exit-code detail when unusable', () => {
    renderCard({ status: 'unusable', detail: 'exit code 1' })

    expect(screen.getByText(`${UNUSABLE_FRIENDLY_MESSAGE} · exit code 1`)).toBeInTheDocument()
  })

  it('shows the technical detail verbatim, unaltered — a first-stderr-line example', () => {
    renderCard({ status: 'unusable', detail: 'Error: no se pudo leer la salida' })

    expect(screen.getByText(/Error: no se pudo leer la salida$/)).toBeInTheDocument()
  })

  it('does not show the unusable message when connected', () => {
    renderCard({ status: 'connected', capabilities: ALL_CAPABLE })

    expect(screen.queryByText(new RegExp(UNUSABLE_FRIENDLY_MESSAGE))).not.toBeInTheDocument()
  })

  it('does not show the unusable message when not-found', () => {
    renderCard({ status: 'not-found' })

    expect(screen.queryByText(new RegExp(UNUSABLE_FRIENDLY_MESSAGE))).not.toBeInTheDocument()
  })
})

// The path field and its warning are driven by ONE boolean in the component,
// which is what stops them from ever drifting apart.
describe('ConnectionStatusCard — path field and execution warning move together', () => {
  it.each([
    ['not-found', { status: 'not-found' as const }],
    ['unusable', { status: 'unusable' as const, detail: 'exit code 1' }],
    [
      'connected but running from an override',
      {
        status: 'connected' as const,
        source: 'override' as const,
        overridePath: 'C:\\x\\claude.cmd',
        capabilities: ALL_CAPABLE
      }
    ],
    ['connected but inert', { status: 'connected' as const, capabilities: { ...ALL_CAPABLE, structuredOutput: false } }]
  ])('shows both when %s', (_label, overrides) => {
    renderCard(overrides)

    expect(screen.getByPlaceholderText(PATH_INPUT_PLACEHOLDER)).toBeInTheDocument()
    expect(screen.getByText(executionWarningCopy('claude'))).toBeInTheDocument()
  })

  it('shows the persisted override in the field so the user can see and clear it', () => {
    renderCard({
      status: 'connected',
      source: 'override',
      overridePath: 'C:\\x\\claude.cmd',
      capabilities: ALL_CAPABLE
    })

    expect(screen.getByDisplayValue('C:\\x\\claude.cmd')).toBeInTheDocument()
  })

  it('commits the typed path on blur', () => {
    const { onCommitPath } = renderCard({ status: 'not-found' })

    const input = screen.getByLabelText('Ruta manual del ejecutable de Claude Code')
    fireEvent.change(input, { target: { value: 'C:\\bin\\claude.cmd' } })
    fireEvent.blur(input)

    expect(onCommitPath).toHaveBeenCalledWith('C:\\bin\\claude.cmd')
  })

  it('commits null when the field is emptied, resuming autodetection', () => {
    const { onCommitPath } = renderCard({
      status: 'connected',
      source: 'override',
      overridePath: 'C:\\x\\claude.cmd',
      capabilities: ALL_CAPABLE
    })

    const input = screen.getByLabelText('Ruta manual del ejecutable de Claude Code')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)

    expect(onCommitPath).toHaveBeenCalledWith(null)
  })
})

// The capability ROWS are gone; their caveats are not. A supported capability
// is silence, which is what lets a healthy CLI collapse to one line — but a
// missing one is a fact the user has no other way to discover.
describe('ConnectionStatusCard — capability caveats survive the collapse', () => {
  it('warns that answers are slower when the CLI has no warm session', () => {
    renderCard({ status: 'connected', capabilities: { ...ALL_CAPABLE, warmSession: false } })

    expect(screen.getByText(/Cada pregunta arranca el CLI de cero/)).toBeInTheDocument()
  })

  it('warns that read-only cannot be guaranteed when the CLI has no tool allowlist', () => {
    renderCard({ status: 'connected', capabilities: { ...ALL_CAPABLE, readOnlyTools: false } })

    expect(screen.getByText(/no permite limitar sus herramientas/)).toBeInTheDocument()
  })

  it('says nothing at all when every capability is present', () => {
    renderCard({ status: 'connected', capabilities: ALL_CAPABLE })

    expect(screen.queryByText(/Cada pregunta arranca el CLI de cero/)).not.toBeInTheDocument()
    expect(screen.queryByText(/no permite limitar sus herramientas/)).not.toBeInTheDocument()
  })

  // An inert CLI already gets `INERT_MESSAGE`, which says the same thing at
  // more length. Printing both would be the screen repeating itself.
  it('does not repeat the structured-output caveat next to the inert message', () => {
    renderCard({ status: 'connected', capabilities: { ...ALL_CAPABLE, structuredOutput: false } })

    expect(screen.getByText(INERT_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText(/no acepta las opciones que la app necesita para leer/)).not.toBeInTheDocument()
  })
})
