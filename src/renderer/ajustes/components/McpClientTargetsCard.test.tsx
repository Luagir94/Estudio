// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { McpClientTargetStatus } from '../../../shared/ipc/mcp'
import { McpClientTargetsCard } from './McpClientTargetsCard'

const claudeCode: McpClientTargetStatus = {
  target: 'claude-code',
  configPath: 'C:\\Users\\lucia\\.claude.json',
  detected: true,
  connected: false
}

function renderCard(overrides: Partial<ComponentProps<typeof McpClientTargetsCard>> = {}) {
  const onRegister = vi.fn()
  const onUnregister = vi.fn()
  render(
    <McpClientTargetsCard
      targets={[claudeCode]}
      canRegister
      onRegister={onRegister}
      onUnregister={onUnregister}
      pendingTarget={null}
      {...overrides}
    />
  )
  return { onRegister, onUnregister }
}

describe('McpClientTargetsCard', () => {
  it('shows the approved title, detail line and plaintext-token warning', () => {
    renderCard()

    expect(screen.getByRole('heading', { name: 'Clientes MCP' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Course Companion escribe su propia entrada en el archivo del cliente y no toca nada más · el resto se configura a mano'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Al registrar, tu token queda escrito en texto plano en ese archivo. Rotarlo o revocarlo reescribe los clientes registrados.'
      )
    ).toBeInTheDocument()
  })

  // The consent rule made visible: a user cannot agree to a file being written
  // without being shown WHICH file, before they press anything.
  it('shows the exact config path before any write', () => {
    renderCard()

    expect(screen.getByText('C:\\Users\\lucia\\.claude.json')).toBeInTheDocument()
  })

  it('offers Registrar with the absent state when this app is not in the file', () => {
    renderCard()

    expect(screen.getByText('Sin registrar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeEnabled()
  })

  it('offers Quitar with the connected state once this app is in the file', () => {
    renderCard({ targets: [{ ...claudeCode, connected: true }] })

    expect(screen.getByText('Registrado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument()
  })

  it('reports the target the user asked to register', async () => {
    const { onRegister } = renderCard()

    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(onRegister).toHaveBeenCalledWith('claude-code')
  })

  it('reports the target the user asked to remove', async () => {
    const { onUnregister } = renderCard({ targets: [{ ...claudeCode, connected: true }] })

    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }))

    expect(onUnregister).toHaveBeenCalledWith('claude-code')
  })

  // The same gate `McpTokenCard`'s copy button uses: the plaintext token exists
  // only in this session's state, and registering without one would write a
  // config that can never connect.
  it('cannot register while no token has been issued this session', () => {
    renderCard({ canRegister: false })

    expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled()
  })

  it('cannot register a client that is not installed on this machine', () => {
    renderCard({ targets: [{ ...claudeCode, detected: false }] })

    expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled()
  })

  it('marks the row busy while its own write is in flight', () => {
    renderCard({ pendingTarget: 'claude-code' })

    const button = screen.getByRole('button', { name: 'Registrar' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('renders nothing but the card chrome when no client is offered', () => {
    renderCard({ targets: [] })

    expect(screen.getByRole('heading', { name: 'Clientes MCP' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
