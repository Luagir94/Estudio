// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpAuditEntry } from '../../../shared/ipc/mcp'
import { ActividadMcpContainer } from './ActividadMcpContainer'

const entry: McpAuditEntry = {
  id: 9,
  occurredAt: '2026-09-03T14:32:00.000Z',
  tool: 'entregas_create',
  slice: 'entregas',
  action: 'write',
  outcome: 'success',
  summary: 'entregas#12 creada',
  clientName: 'claude-code',
  errorCode: null
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  return { ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>), invalidateSpy }
}

describe('ActividadMcpContainer', () => {
  beforeEach(() => {
    // @ts-expect-error test-only global bridge stub, no full Electron preload context
    window.api = { mcp: { listActivity: vi.fn(), onActivityChanged: vi.fn() } }
    vi.mocked(window.api.mcp.listActivity).mockResolvedValue({ ok: true, data: [entry] })
    vi.mocked(window.api.mcp.onActivityChanged).mockReturnValue(vi.fn())
  })

  it('fetches and renders the activity list via mcp:listActivity', async () => {
    renderWithClient(<ActividadMcpContainer onBack={vi.fn()} />)

    expect(await screen.findByText('entregas_create')).toBeInTheDocument()
    expect(screen.getByText('entregas#12 creada')).toBeInTheDocument()
    expect(window.api.mcp.listActivity).toHaveBeenCalledTimes(1)
  })

  it('reports onBack when the back button is pressed', async () => {
    const onBack = vi.fn()
    renderWithClient(<ActividadMcpContainer onBack={onBack} />)
    await screen.findByText('entregas_create')

    fireEvent.click(screen.getByRole('button', { name: /Volver a Ajustes/ }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  // The refetch is PUSH-driven (design D9): `mcp:activity-changed` fires on
  // every audit insert, and this screen must invalidate its own cache entry
  // in response — same convention `AttachmentViewerContainer.test.tsx` proves
  // for `indexado:status-changed`.
  it('subscribes to mcp:activity-changed and invalidates the activity cache on a push', async () => {
    let pushChanged: ((payload: { id: number }) => void) | undefined
    window.api.mcp.onActivityChanged = vi.fn().mockImplementation((callback) => {
      pushChanged = callback
      return vi.fn()
    })

    const { invalidateSpy } = renderWithClient(<ActividadMcpContainer onBack={vi.fn()} />)
    await screen.findByText('entregas_create')

    invalidateSpy.mockClear()
    pushChanged?.({ id: 10 })

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['mcp', 'activity'] }))
  })

  // A screen that mounts and unmounts repeatedly must not stack listeners —
  // same rollback-proof convention `AdjuntosContainer.test.tsx` established
  // for `indexado:status-changed`.
  it('unsubscribes from mcp:activity-changed on unmount', async () => {
    const unsubscribe = vi.fn()
    window.api.mcp.onActivityChanged = vi.fn().mockReturnValue(unsubscribe)

    const { unmount } = renderWithClient(<ActividadMcpContainer onBack={vi.fn()} />)
    await screen.findByText('entregas_create')

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
