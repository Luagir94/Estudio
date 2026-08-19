// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AjustesContainer } from './AjustesContainer'

// Wraps the real `useQuery` in a spy (not a stub) so behaviour stays real —
// only the CALL SHAPE is inspected, to assert the exact options this slice
// is required to pass (spec "Probe on Open, Manual Retry Only"): probe once
// on mount, no background polling. This is the test that would fail if
// someone later added a `refetchInterval`.
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQuery: vi.fn(actual.useQuery) }
})

const connectedStatus = {
  provider: 'claude' as const,
  status: 'connected' as const,
  version: '2.1.220',
  resolvedPath: 'C:\\nvm4w\\nodejs\\claude.cmd',
  source: 'auto' as const,
  overridePath: null,
  detail: null,
  capabilities: { structuredOutput: true, warmSession: true, readOnlyTools: true }
}

// The screen draws one pair of cards per supported CLI, so the probe answers
// with a LIST. The two unverified providers are reported as not installed,
// which is the true state of the machine this suite runs on.
const notFoundStatus = (provider: 'gemini' | 'codex') => ({
  provider,
  status: 'not-found' as const,
  version: null,
  resolvedPath: null,
  source: 'auto' as const,
  overridePath: null,
  detail: null,
  capabilities: null
})

const allStatuses = [connectedStatus, notFoundStatus('gemini'), notFoundStatus('codex')]

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.mocked(useQuery).mockClear()
  // Assign onto the REAL jsdom `window` — same convention as
  // `AdjuntosContainer.test.tsx`.
  window.api = {
    ask: {
      question: vi.fn(),
      cancel: vi.fn(),
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      deleteConversation: vi.fn()
    },
    cli: { status: vi.fn().mockResolvedValue({ ok: true, data: allStatuses }), setOverride: vi.fn(), models: vi.fn() },
    materias: {
      create: vi.fn(),
      list: vi.fn(),
      detail: vi.fn(),
      updateSchedule: vi.fn(),
      delete: vi.fn(),
      setOutcome: vi.fn()
    },
    horario: { week: vi.fn() },
    hoy: { dashboard: vi.fn() },
    carreras: {
      create: vi.fn(),
      list: vi.fn(),
      detail: vi.fn(),
      update: vi.fn(),
      createPeriod: vi.fn(),
      updatePeriod: vi.fn(),
      deletePeriod: vi.fn(),
      delete: vi.fn()
    },
    finales: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    entregas: { create: vi.fn(), list: vi.fn(), update: vi.fn(), setDone: vi.fn(), delete: vi.fn() },
    adjuntos: { list: vi.fn(), add: vi.fn(), open: vi.fn(), remove: vi.fn() },
    app: { openExternal: vi.fn(), exportJson: vi.fn(), onExportRequested: vi.fn() }
  }
})

describe('AjustesContainer', () => {
  it('probes claude:status once on mount', async () => {
    renderWithClient(<AjustesContainer />)

    await screen.findByText('Conectado')
    expect(window.api.cli.status).toHaveBeenCalledTimes(1)
  })

  // Probe on Open, Manual Retry Only — the absence of `refetchInterval` is a
  // requirement, not an accident. This assertion is the RED that would catch
  // background polling added later.
  it('configures the query with refetchOnMount "always", staleTime 0, and no refetchInterval', async () => {
    renderWithClient(<AjustesContainer />)

    await screen.findByText('Conectado')

    const options = vi.mocked(useQuery).mock.calls[0][0]
    expect(options.refetchOnMount).toBe('always')
    expect(options.staleTime).toBe(0)
    expect(options).not.toHaveProperty('refetchInterval')
  })

  it('renders the page title and subtitle', async () => {
    renderWithClient(<AjustesContainer />)

    expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeInTheDocument()
    expect(screen.getByText('La app nunca ejecuta nada por su cuenta · todo queda en tu máquina')).toBeInTheDocument()
    await screen.findByText('Conectado')
  })

  it('renders the ConnectionStatusCard with the probed status', async () => {
    renderWithClient(<AjustesContainer />)

    expect(await screen.findByText('Conectado')).toBeInTheDocument()
    expect(screen.getByText('2.1.220')).toBeInTheDocument()
  })

  it('renders the ManualPathCard with the current override path', async () => {
    window.api.cli.status = vi.fn().mockResolvedValue({
      ok: true,
      data: [{ ...connectedStatus, source: 'override' as const, overridePath: 'C:\\bin\\claude.cmd' }]
    })

    renderWithClient(<AjustesContainer />)

    expect(await screen.findByDisplayValue('C:\\bin\\claude.cmd')).toBeInTheDocument()
  })

  it('renders the policy note with the exact disclosed copy', async () => {
    renderWithClient(<AjustesContainer />)

    await screen.findByText('Conectado')
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'P' &&
          element.textContent ===
            'Esta pantalla solo detecta los CLI y corre `claude --version`, `gemini --version` y `codex --version`, más su página de ayuda para ver qué opciones acepta la versión instalada. No envía tus materias, tus adjuntos ni tus notas a ningún lado, y no ejecuta ningún otro comando.'
      )
    ).toBeInTheDocument()
  })

  it('clicking "Reintentar" re-probes via refetch (spec: Reintentar re-probes)', async () => {
    renderWithClient(<AjustesContainer />)

    await screen.findByText('Conectado')
    expect(window.api.cli.status).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(window.api.cli.status).toHaveBeenCalledTimes(2))
  })

  it('committing a new override calls setOverride and updates the cached status without a manual reload', async () => {
    window.api.cli.setOverride = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ...connectedStatus,
        source: 'override' as const,
        overridePath: 'C:\\bin\\claude.cmd',
        version: '2.2.0'
      }
    })

    renderWithClient(<AjustesContainer />)
    await screen.findByText('Conectado')

    fireEvent.click(screen.getAllByRole('button', { name: /usar otra ruta/i })[0])
    const input = screen.getByLabelText('Ruta manual del ejecutable de Claude Code')
    fireEvent.change(input, { target: { value: 'C:\\bin\\claude.cmd' } })
    fireEvent.blur(input)

    // The payload names the provider whose override changed — the handler
    // resolves the settings key from it, never from the path.
    await waitFor(() =>
      expect(window.api.cli.setOverride).toHaveBeenCalledWith({ provider: 'claude', path: 'C:\\bin\\claude.cmd' })
    )
    expect(await screen.findByText('2.2.0')).toBeInTheDocument()
    // Cache was updated directly by the mutation, not by a second probe.
    expect(window.api.cli.status).toHaveBeenCalledTimes(1)
  })
})
