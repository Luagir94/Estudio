// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpStatusResult } from '../../../shared/ipc/mcp'
import { McpTokenCard } from './McpTokenCard'

const baseStatus: McpStatusResult = {
  listener: 'listening',
  listenerError: null,
  tokenIssuedAt: '2026-09-03T10:00:00.000Z',
  shimPath: 'C:\\app\\resources\\mcp-shim\\index.cjs',
  endpoint: '\\\\.\\pipe\\course-companion-mcp-abc123',
  permissions: []
}

function renderCard(overrides: Partial<ComponentProps<typeof McpTokenCard>> = {}) {
  const onRotate = vi.fn()
  const onRevoke = vi.fn()
  render(
    <McpTokenCard
      status={baseStatus}
      issuedToken={null}
      onRotate={onRotate}
      onRevoke={onRevoke}
      isRotating={false}
      isRevoking={false}
      {...overrides}
    />
  )
  return { onRotate, onRevoke }
}

describe('McpTokenCard', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('shows the listening status and the approved detail line', () => {
    renderCard()

    expect(screen.getByRole('heading', { name: 'Conexión MCP' })).toBeInTheDocument()
    expect(screen.getByText('Escuchando')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Cualquier CLI que hable MCP puede leer y escribir tu cursada · el token viaja por variable de entorno'
      )
    ).toBeInTheDocument()
  })

  it('shows a stopped status when the listener is not running', () => {
    renderCard({ status: { ...baseStatus, listener: 'stopped', tokenIssuedAt: null } })

    expect(screen.getByText('Detenida')).toBeInTheDocument()
  })

  // Task 15.2 / design D7-D8: issue and rotate are the SAME call — "Rotar"
  // fires it whether a token already exists or this is the very first one.
  it('rotates (or issues the first token) when "Rotar" is pressed', () => {
    const { onRotate } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Rotar' }))

    expect(onRotate).toHaveBeenCalledTimes(1)
  })

  it('revokes when "Revocar" is pressed', () => {
    const { onRevoke } = renderCard({ status: { ...baseStatus, listener: 'listening' } })

    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }))

    expect(onRevoke).toHaveBeenCalledTimes(1)
  })

  it('disables "Revocar" when no token has ever been issued', () => {
    renderCard({ status: { ...baseStatus, tokenIssuedAt: null } })

    expect(screen.getByRole('button', { name: 'Revocar' })).toBeDisabled()
  })

  // The security requirement this card exists to honor: the plaintext token
  // is shown ONLY right after an issue/rotate this session, never re-fetched
  // (`mcp:status` cannot read it back at all).
  it('shows the plaintext token and the one-time warning only while it is held this session', () => {
    renderCard({ issuedToken: 'cc_mcp_freshtoken' })

    expect(screen.getByText('cc_mcp_freshtoken')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Se muestra una sola vez. Copialo ahora — después solo queda guardado su hash y no hay forma de volver a verlo.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeEnabled()
  })

  it('renders no token box, no warning, and a disabled "Copiar" before any token is held', () => {
    renderCard()

    expect(screen.queryByText(/Se muestra una sola vez/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeDisabled()
  })

  it('copies the client config snippet built from the shim path and the held token, not the bare token', () => {
    renderCard({ issuedToken: 'cc_mcp_freshtoken' })

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify(
        {
          mcpServers: {
            'course-companion': {
              command: 'node',
              args: ['C:\\app\\resources\\mcp-shim\\index.cjs'],
              env: { COURSE_COMPANION_MCP_TOKEN: 'cc_mcp_freshtoken' }
            }
          }
        },
        null,
        2
      )
    )
  })
})
