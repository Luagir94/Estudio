// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { executionWarningCopy } from '../domain/connectionDisplay'

const EXECUTION_WARNING_COPY = executionWarningCopy('claude')
import { ManualPathCard } from './ManualPathCard'

const PLACEHOLDER = 'C:\\ruta\\a\\claude.cmd'

// The execution warning is the sole user-facing compensating control for a
// trust boundary that admits no allowlist (design D9, spec "Manual Path
// Override Field with Execution Warning") — it MUST render unconditionally.
// `ManualPathCard` intentionally takes NO `status` prop: it has no signal to
// gate the warning on in the first place, which is the strongest form of
// "unconditional". The two blocks below render it exactly as it would
// appear while the settings screen sits in each of the three connection
// states (connected/not-found/unusable) — an identical render across all
// three proves nothing in this component COULD vary by that context, which
// is what stops a future refactor from threading a status prop in just to
// gate this block.
const SIMULATED_SCREEN_STATES = ['connected', 'not-found', 'unusable'] as const

describe('ManualPathCard — execution warning renders unconditionally', () => {
  it.each(SIMULATED_SCREEN_STATES)(
    'shows the warning verbatim with no override set, as it would render on a %s screen',
    () => {
      render(<ManualPathCard provider="claude" overridePath={null} onCommit={vi.fn()} />)
      expect(screen.getByText(EXECUTION_WARNING_COPY)).toBeInTheDocument()
    }
  )

  it.each(SIMULATED_SCREEN_STATES)(
    'shows the warning verbatim with an override already set, as it would render on a %s screen',
    () => {
      render(<ManualPathCard provider="claude" overridePath={'C:\\nvm4w\\nodejs\\claude.cmd'} onCommit={vi.fn()} />)
      expect(screen.getByText(EXECUTION_WARNING_COPY)).toBeInTheDocument()
    }
  )

  it('keeps the warning visible while the field is focused', async () => {
    const user = userEvent.setup()
    render(<ManualPathCard provider="claude" overridePath={null} onCommit={vi.fn()} />)

    await user.click(screen.getByPlaceholderText(PLACEHOLDER))

    expect(screen.getByText(EXECUTION_WARNING_COPY)).toBeInTheDocument()
  })

  it('keeps the warning visible once the field is filled but not yet committed', async () => {
    const user = userEvent.setup()
    render(<ManualPathCard provider="claude" overridePath={null} onCommit={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'C:\\claude\\claude.cmd')

    expect(screen.getByText(EXECUTION_WARNING_COPY)).toBeInTheDocument()
  })

  it('keeps the warning visible after the field is blurred back to unfocused', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ManualPathCard provider="claude" overridePath={null} onCommit={vi.fn()} />
        <button type="button">elsewhere</button>
      </>
    )

    await user.click(screen.getByPlaceholderText(PLACEHOLDER))
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))

    expect(screen.getByText(EXECUTION_WARNING_COPY)).toBeInTheDocument()
  })
})

describe('ManualPathCard — layout and copy fidelity', () => {
  it('renders the head, the Avanzado chip and the helper text', () => {
    render(<ManualPathCard provider="claude" overridePath={null} onCommit={vi.fn()} />)

    expect(screen.getByText('Ruta manual')).toBeInTheDocument()
    expect(screen.getByText('Avanzado')).toBeInTheDocument()
    expect(
      screen.getByText('Vacío = detección automática. Solo se usa si el archivo existe y es ejecutable.')
    ).toBeInTheDocument()
  })

  it('prefills the field with the current override', () => {
    render(<ManualPathCard provider="claude" overridePath={'C:\\nvm4w\\nodejs\\claude.cmd'} onCommit={vi.fn()} />)

    expect(screen.getByDisplayValue('C:\\nvm4w\\nodejs\\claude.cmd')).toBeInTheDocument()
  })

  it('leaves the field empty when there is no override', () => {
    render(<ManualPathCard provider="claude" overridePath={null} onCommit={vi.fn()} />)

    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue('')
  })
})

describe('ManualPathCard — commit behaviour', () => {
  it('commits the typed path on blur', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <>
        <ManualPathCard provider="claude" overridePath={null} onCommit={onCommit} />
        <button type="button">elsewhere</button>
      </>
    )

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'C:\\claude\\claude.cmd')
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))

    expect(onCommit).toHaveBeenCalledWith('C:\\claude\\claude.cmd')
  })

  it('commits the typed path on Enter without waiting for blur', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<ManualPathCard provider="claude" overridePath={null} onCommit={onCommit} />)

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'C:\\claude\\claude.cmd{Enter}')

    expect(onCommit).toHaveBeenCalledWith('C:\\claude\\claude.cmd')
  })

  it('commits null when the field is cleared', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<ManualPathCard provider="claude" overridePath={'C:\\claude\\claude.cmd'} onCommit={onCommit} />)

    await user.clear(screen.getByDisplayValue('C:\\claude\\claude.cmd'))
    await user.tab()

    expect(onCommit).toHaveBeenCalledWith(null)
  })

  it('renders no save button — the field is the only control', () => {
    render(<ManualPathCard provider="claude" overridePath={null} onCommit={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument()
  })
})
