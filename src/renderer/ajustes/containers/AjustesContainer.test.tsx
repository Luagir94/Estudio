// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQueries } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLI_PROVIDERS } from '../../../shared/ipc/cli'
import type { Palette } from '../../../shared/ipc/theme'
import { CONNECT_ACTION, DETECTING_LABEL, RETRY_ACTION } from '../domain/connectionDisplay'
import { AjustesContainer } from './AjustesContainer'

// Wraps the real `useQueries` in a spy (not a stub) so behaviour stays real —
// only the CALL SHAPE is inspected, to assert the exact options this slice is
// required to pass: every provider query starts DISABLED, and there is no
// background polling. This is the test that would fail if someone re-added an
// eager probe or a `refetchInterval`.
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQueries: vi.fn(actual.useQueries) }
})

const connectedStatus = {
  provider: 'claude' as const,
  status: 'connected' as const,
  version: '2.1.220',
  resolvedPath: 'C:\\nvm4w\\nodejs\\claude.cmd',
  source: 'auto' as const,
  overridePath: null,
  detail: null,
  failureReason: null,
  capabilities: { structuredOutput: true, warmSession: true, readOnlyTools: true }
}

/** The persisted preferences the screen reads before it may probe anything. */
/** A saved path for ONE provider that is NOT connected — the state a returning student is in. */
function prefsWithPath(provider: string, overridePath: string) {
  return CLI_PROVIDERS.map((entry) => ({
    provider: entry,
    connected: false,
    overridePath: entry === provider ? overridePath : null,
    lastStatus: null
  }))
}

function prefs(connected: readonly string[], overridePath: string | null = null) {
  return CLI_PROVIDERS.map((provider) => ({
    provider,
    connected: connected.includes(provider),
    overridePath: connected.includes(provider) ? overridePath : null,
    lastStatus: connected.includes(provider) ? ('connected' as const) : null
  }))
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

/** Presses the "Conectar" button of one card — the only thing that starts a probe. */
function connect(cliLabel: string): void {
  fireEvent.click(screen.getByRole('button', { name: `${CONNECT_ACTION} ${cliLabel}` }))
}

beforeEach(() => {
  vi.mocked(useQueries).mockClear()
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
    planificador: {
      list: vi.fn(),
      addPrerequisite: vi.fn(),
      updatePrerequisite: vi.fn(),
      removePrerequisite: vi.fn(),
      addEntry: vi.fn(),
      removeEntry: vi.fn()
    },
    cli: {
      probe: vi.fn().mockResolvedValue({ ok: true, data: connectedStatus }),
      // Conectar COMMITS the field, so the connect path runs through here.
      setOverride: vi.fn().mockResolvedValue({ ok: true, data: connectedStatus }),
      preferences: vi.fn().mockResolvedValue({ ok: true, data: prefs([]) }),
      disconnect: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      models: vi.fn()
    },
    theme: {
      getPreference: vi.fn().mockResolvedValue({ ok: true, data: 'system' }),
      setPreference: vi.fn().mockResolvedValue({ ok: true, data: 'system' }),
      getPalette: vi.fn().mockResolvedValue({ ok: true, data: 'amatista' }),
      // Echoes whatever it was asked to persist, like the real handler does.
      setPalette: vi.fn((input: { palette: Palette }) => Promise.resolve({ ok: true as const, data: input.palette }))
    },
    materias: {
      create: vi.fn(),
      list: vi.fn(),
      detail: vi.fn(),
      updateSchedule: vi.fn(),
      delete: vi.fn(),
      setOutcome: vi.fn()
    },
    horario: { week: vi.fn() },
    fechas: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
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
    parciales: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    clases: { setAttendance: vi.fn(), clearAttendance: vi.fn(), saveNote: vi.fn(), deleteNote: vi.fn() },
    entregas: { create: vi.fn(), list: vi.fn(), update: vi.fn(), setDone: vi.fn(), delete: vi.fn() },
    adjuntos: { list: vi.fn(), add: vi.fn(), open: vi.fn(), remove: vi.fn(), read: vi.fn(), write: vi.fn() },
    indexado: { sync: vi.fn(), onStatusChanged: vi.fn().mockReturnValue(vi.fn()) },
    app: { openExternal: vi.fn(), exportJson: vi.fn(), onExportRequested: vi.fn() }
  }
})

describe('AjustesContainer', () => {
  // THE requirement. Opening this screen used to spawn up to six short-lived
  // processes for CLIs the student may not have installed.
  it('probes nothing on mount', async () => {
    renderWithClient(<AjustesContainer />)

    expect(await screen.findAllByRole('button', { name: new RegExp('^' + CONNECT_ACTION) })).toHaveLength(
      CLI_PROVIDERS.length
    )
    expect(window.api.cli.probe).not.toHaveBeenCalled()
  })

  // The absence of a background refetch is a requirement, not an accident.
  it('starts every provider query disabled, with no refetchInterval', () => {
    renderWithClient(<AjustesContainer />)

    const { queries } = vi.mocked(useQueries).mock.calls[0]![0] as {
      queries: { enabled: boolean; staleTime: number }[]
    }
    expect(queries).toHaveLength(CLI_PROVIDERS.length)
    for (const query of queries) {
      expect(query.enabled).toBe(false)
      expect(query.staleTime).toBe(0)
      expect(query).not.toHaveProperty('refetchInterval')
      expect(query).not.toHaveProperty('refetchOnMount')
    }
  })

  it('renders one idle card per supported CLI, each naming its own connect button', () => {
    renderWithClient(<AjustesContainer />)

    for (const label of ['Claude Code', 'Antigravity CLI', 'Codex CLI']) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `${CONNECT_ACTION} ${label}` })).toBeInTheDocument()
    }
  })

  // Conectar COMMITS the field and probes in one main-side round trip, so the
  // renderer sees `setOverride` rather than `probe`. An empty field commits
  // `null`, which is the app saying "autodetect on the PATH" out loud instead
  // of leaving a saved path silently in force.
  it('connects only the CLI whose "Conectar" was pressed', async () => {
    renderWithClient(<AjustesContainer />)

    connect('Claude Code')

    await screen.findByText('Conectado')
    expect(window.api.cli.setOverride).toHaveBeenCalledTimes(1)
    expect(window.api.cli.setOverride).toHaveBeenCalledWith({ provider: 'claude', path: null })
  })

  // Connecting one CLI must leave its neighbours exactly as they were: still
  // idle, still unclaimed, still unprobed.
  it('leaves the other cards idle when one is connected', async () => {
    renderWithClient(<AjustesContainer />)

    connect('Claude Code')

    await screen.findByText('Conectado')
    expect(screen.getAllByRole('button', { name: new RegExp('^' + CONNECT_ACTION) })).toHaveLength(
      CLI_PROVIDERS.length - 1
    )
    expect(screen.getByRole('button', { name: `${CONNECT_ACTION} Codex CLI` })).toBeInTheDocument()
  })

  // The card is the skeleton: it exists from the first frame and fills in,
  // rather than the screen rendering nothing while a process boots.
  it('swaps the pressed card to a detecting card while its first probe is in flight', async () => {
    let resolveProbe: (value: unknown) => void = () => {}
    window.api.cli.setOverride = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve
      })
    )

    renderWithClient(<AjustesContainer />)
    connect('Claude Code')

    expect(await screen.findByText(DETECTING_LABEL)).toBeInTheDocument()
    // Only the pressed card moved; the other two never left idle.
    expect(screen.getAllByRole('button', { name: new RegExp('^' + CONNECT_ACTION) })).toHaveLength(
      CLI_PROVIDERS.length - 1
    )

    resolveProbe({ ok: true, data: connectedStatus })

    await screen.findByText('Conectado')
    expect(screen.queryByText(DETECTING_LABEL)).not.toBeInTheDocument()
  })

  // A re-probe keeps the previous result on screen — it is still the last
  // thing actually observed — so the button is the only honest place left to
  // say that work is in flight.
  it('re-probes only its own CLI from the card\u2019s "Reintentar", and marks that button busy', async () => {
    renderWithClient(<AjustesContainer />)
    connect('Claude Code')
    await screen.findByText('Conectado')

    let resolveProbe: (value: unknown) => void = () => {}
    window.api.cli.probe = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve
      })
    )

    const retry = screen.getByRole('button', { name: `${RETRY_ACTION} Claude Code` })
    fireEvent.click(retry)

    await waitFor(() => expect(retry).toHaveAttribute('aria-busy', 'true'))
    expect(retry).toBeDisabled()
    expect(window.api.cli.probe).toHaveBeenCalledWith({ provider: 'claude' })
    expect(window.api.cli.probe).toHaveBeenCalledTimes(1)

    resolveProbe({ ok: true, data: connectedStatus })

    await waitFor(() => expect(retry).toHaveAttribute('aria-busy', 'false'))
    expect(retry).toBeEnabled()
  })

  it('renders the page title and subtitle', () => {
    renderWithClient(<AjustesContainer />)

    expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeInTheDocument()
    expect(screen.getByText('La app nunca ejecuta nada por su cuenta · todo queda en tu máquina')).toBeInTheDocument()
  })

  // The screen-wide "Reintentar" was the one control that re-probed every CLI
  // at once, which is precisely the fan-out this screen no longer does.
  it('offers no screen-wide retry control', () => {
    renderWithClient(<AjustesContainer />)

    expect(screen.queryByRole('button', { name: RETRY_ACTION })).not.toBeInTheDocument()
  })

  // A healthy autodetected CLI collapses to one line: the chip, and nothing
  // the user did not ask about.
  it('renders the connected row as a single line', async () => {
    renderWithClient(<AjustesContainer />)

    connect('Claude Code')

    expect(await screen.findByText('Conectado')).toBeInTheDocument()
    expect(screen.queryByText('2.1.220')).not.toBeInTheDocument()
    expect(screen.queryByText('C:\\nvm4w\\nodejs\\claude.cmd')).not.toBeInTheDocument()
  })

  it('shows the current override path in the row that runs from one', async () => {
    // Already connected, so the row is ANSWERED and its path comes from the
    // probed status rather than from the persisted preferences.
    window.api.cli.preferences = vi.fn().mockResolvedValue({ ok: true, data: prefs(['claude']) })
    window.api.cli.probe = vi.fn().mockResolvedValue({
      ok: true,
      data: { ...connectedStatus, source: 'override' as const, overridePath: 'C:\\bin\\claude.cmd' }
    })

    renderWithClient(<AjustesContainer />)

    expect(await screen.findByDisplayValue('C:\\bin\\claude.cmd')).toBeInTheDocument()
  })

  // Connecting with a path PERSISTS it, so someone who already knows their
  // install is off the PATH gets there in one step instead of failing first.
  it('persists a path typed before the first probe instead of probing blind', async () => {
    window.api.cli.setOverride = vi.fn().mockResolvedValue({
      ok: true,
      data: { ...connectedStatus, source: 'override' as const, overridePath: 'C:\\bin\\claude.cmd' }
    })

    renderWithClient(<AjustesContainer />)

    const input = screen.getByLabelText('Ruta manual del ejecutable de Claude Code')
    fireEvent.change(input, { target: { value: 'C:\\bin\\claude.cmd' } })
    fireEvent.blur(input)
    connect('Claude Code')

    await waitFor(() =>
      expect(window.api.cli.setOverride).toHaveBeenCalledWith({ provider: 'claude', path: 'C:\\bin\\claude.cmd' })
    )
    expect(await screen.findByText('Conectado')).toBeInTheDocument()
    // The plain probe never ran: the override write re-probes as part of itself.
    expect(window.api.cli.probe).not.toHaveBeenCalled()
  })

  // An empty field must not clear an override the user never opened this row
  // to touch.
  // A saved path shows up in the idle row and can be CLEARED from it. That is
  // the whole reason Conectar commits an empty field instead of skipping the
  // write: the alternative left the row showing empty while the old path stayed
  // in force.
  it('pre-fills the idle row with the saved path and clears it when emptied', async () => {
    window.api.cli.preferences = vi
      .fn()
      .mockResolvedValue({ ok: true, data: prefsWithPath('antigravity', 'C:\\agy\\agy.exe') })

    renderWithClient(<AjustesContainer />)

    const input = await screen.findByDisplayValue('C:\\agy\\agy.exe')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    connect('Antigravity CLI')

    await waitFor(() =>
      expect(window.api.cli.setOverride).toHaveBeenCalledWith({ provider: 'antigravity', path: null })
    )
  })

  it('renders the policy note with the exact disclosed copy', () => {
    renderWithClient(<AjustesContainer />)

    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'P' &&
          element.textContent ===
            'Esta pantalla solo detecta los CLI que conectes y corre `claude --version`, `agy --version` y `codex --version`, más su página de ayuda para ver qué opciones acepta la versión instalada. No envía tus materias, tus adjuntos ni tus notas a ningún lado, y no ejecuta ningún otro comando.'
      )
    ).toBeInTheDocument()
  })

  it('committing a corrected override calls setOverride and updates the cached status without a second probe', async () => {
    window.api.cli.probe = vi.fn().mockResolvedValue({
      ok: true,
      // `not-found` is the state that actually shows the field on an already
      // answered row — the case where a path is the way out.
      data: { ...connectedStatus, status: 'not-found' as const, version: null, capabilities: null }
    })
    window.api.cli.setOverride = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ...connectedStatus,
        source: 'override' as const,
        overridePath: 'C:\\bin\\claude.cmd'
      }
    })

    // Already connected, so the row is answered and `probe` — not the connect
    // route — is what produced the not-found state the field belongs to.
    window.api.cli.preferences = vi.fn().mockResolvedValue({ ok: true, data: prefs(['claude']) })

    renderWithClient(<AjustesContainer />)
    await screen.findByText('No encontrado')

    const input = screen.getAllByLabelText('Ruta manual del ejecutable de Claude Code')[0]!
    fireEvent.change(input, { target: { value: 'C:\\bin\\claude.cmd' } })
    fireEvent.blur(input)

    // The payload names the provider whose override changed — the handler
    // resolves the settings key from it, never from the path.
    await waitFor(() =>
      expect(window.api.cli.setOverride).toHaveBeenCalledWith({ provider: 'claude', path: 'C:\\bin\\claude.cmd' })
    )
    expect(await screen.findByText('Conectado')).toBeInTheDocument()
    // Cache was updated directly by the mutation, not by a second probe.
    expect(window.api.cli.probe).toHaveBeenCalledTimes(1)
  })
})

describe('AjustesContainer — apariencia', () => {
  it('shows the persisted preference as the pressed segment', async () => {
    window.api.theme.getPreference = vi.fn().mockResolvedValue({ ok: true, data: 'dark' })

    renderWithClient(<AjustesContainer />)

    expect(await screen.findByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'false')
  })

  // The card renders FIRST, right after the header block and before the CLI
  // provider cards (approved `.pen` ordering).
  it('renders the appearance card before every provider card', async () => {
    renderWithClient(<AjustesContainer />)

    await screen.findByRole('heading', { name: 'Apariencia' })
    const cardTitles = screen.getAllByRole('heading', { level: 3 })
    expect(cardTitles[0]).toHaveTextContent('Apariencia')
  })

  // The card claims nothing until the settings read answers — a default
  // painted while the real choice loads would show 'Sistema' pressed to a
  // student who chose 'Oscuro', for exactly as long as the read takes.
  it('renders no appearance card while the preference is still being read', () => {
    window.api.theme.getPreference = vi.fn().mockReturnValue(new Promise(() => {}))

    renderWithClient(<AjustesContainer />)

    expect(screen.queryByRole('heading', { name: 'Apariencia' })).not.toBeInTheDocument()
  })

  it('persists the pressed theme and updates the cache from the echoed value without a re-read', async () => {
    window.api.theme.setPreference = vi.fn().mockResolvedValue({ ok: true, data: 'light' })

    renderWithClient(<AjustesContainer />)

    fireEvent.click(await screen.findByRole('button', { name: 'Claro' }))

    await waitFor(() => expect(window.api.theme.setPreference).toHaveBeenCalledWith({ preference: 'light' }))
    expect(await screen.findByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'true')
    // Cache was updated directly by the mutation, not by a second settings read.
    expect(window.api.theme.getPreference).toHaveBeenCalledTimes(1)
  })

  // A settings read and a native-theme write — never a probe. The theme
  // control must not become a back door into the fan-out this screen removed.
  it('spawns no probe when the theme changes', async () => {
    renderWithClient(<AjustesContainer />)

    fireEvent.click(await screen.findByRole('button', { name: 'Oscuro' }))

    await waitFor(() => expect(window.api.theme.setPreference).toHaveBeenCalledTimes(1))
    expect(window.api.cli.probe).not.toHaveBeenCalled()
    expect(window.api.cli.setOverride).not.toHaveBeenCalled()
  })
})

describe('AjustesContainer — paleta', () => {
  afterEach(() => {
    delete document.documentElement.dataset.palette
  })

  it('shows the persisted palette as the selected option', async () => {
    window.api.theme.getPalette = vi.fn().mockResolvedValue({ ok: true, data: 'malva' })

    renderWithClient(<AjustesContainer />)

    expect(await screen.findByRole('combobox', { name: 'Paleta' })).toHaveValue('malva')
  })

  // Same no-claims-before-the-read rule as the theme half, and the card waits
  // on BOTH: rendering one row while the other loads would change the card's
  // height under the cursor on every open.
  it('renders no appearance card while the palette is still being read', () => {
    window.api.theme.getPalette = vi.fn().mockReturnValue(new Promise(() => {}))

    renderWithClient(<AjustesContainer />)

    expect(screen.queryByRole('heading', { name: 'Apariencia' })).not.toBeInTheDocument()
  })

  it('persists the chosen palette and updates the cache from the echoed value without a re-read', async () => {
    renderWithClient(<AjustesContainer />)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Paleta' }), { target: { value: 'cobalto' } })

    await waitFor(() => expect(window.api.theme.setPalette).toHaveBeenCalledWith({ palette: 'cobalto' }))
    expect(await screen.findByRole('combobox', { name: 'Paleta' })).toHaveValue('cobalto')
    expect(window.api.theme.getPalette).toHaveBeenCalledTimes(1)
  })

  // THE repaint. Unlike the theme preference, which `nativeTheme.themeSource`
  // puts into effect on the main side, nothing applies a palette but this — so
  // if the attribute stops being written the setting silently does nothing
  // until the next launch.
  it('puts the chosen palette on the document element', async () => {
    renderWithClient(<AjustesContainer />)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Paleta' }), { target: { value: 'turquesa' } })

    await waitFor(() => expect(document.documentElement.getAttribute('data-palette')).toBe('turquesa'))
  })

  // A palette on screen that failed to persist is a lie the next launch
  // corrects, so the repaint waits for the write to come back.
  it('leaves the document alone when the write fails', async () => {
    window.api.theme.setPalette = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'PALETTE_WRITE_FAILED', message: 'disk is full' } })

    renderWithClient(<AjustesContainer />)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Paleta' }), { target: { value: 'grafito' } })

    await waitFor(() => expect(window.api.theme.setPalette).toHaveBeenCalledTimes(1))
    expect(document.documentElement.getAttribute('data-palette')).toBeNull()
  })

  // The two axes are independent all the way up. Picking a colour must not
  // move light/dark, and it must not become a back door into the CLI fan-out
  // this screen removed either.
  it('writes no theme preference and spawns no probe when the palette changes', async () => {
    renderWithClient(<AjustesContainer />)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Paleta' }), { target: { value: 'cuarzo' } })

    await waitFor(() => expect(window.api.theme.setPalette).toHaveBeenCalledTimes(1))
    expect(window.api.theme.setPreference).not.toHaveBeenCalled()
    expect(window.api.cli.probe).not.toHaveBeenCalled()
    expect(window.api.cli.setOverride).not.toHaveBeenCalled()
  })

  it('writes no palette when the theme changes', async () => {
    renderWithClient(<AjustesContainer />)

    fireEvent.click(await screen.findByRole('button', { name: 'Oscuro' }))

    await waitFor(() => expect(window.api.theme.setPreference).toHaveBeenCalledTimes(1))
    expect(window.api.theme.setPalette).not.toHaveBeenCalled()
  })
})

// The opt-in has to outlive the process. Re-asking on every launch for a
// decision the student already made was the bug this fixes — and honoring that
// decision is the opposite of making it for them.
describe('AjustesContainer — the opt-in persists', () => {
  it('re-probes a CLI the student had already connected, without being asked again', async () => {
    window.api.cli.preferences = vi.fn().mockResolvedValue({ ok: true, data: prefs(['claude']) })

    renderWithClient(<AjustesContainer />)

    expect(await screen.findByText('Conectado')).toBeInTheDocument()
    expect(window.api.cli.probe).toHaveBeenCalledWith({ provider: 'claude' })
    expect(window.api.cli.probe).toHaveBeenCalledTimes(1)
  })

  // The line the whole change rests on: persistence must never become "probe
  // everything on open" by another route.
  it('leaves an unconnected CLI untouched on open', async () => {
    window.api.cli.preferences = vi.fn().mockResolvedValue({ ok: true, data: prefs(['claude']) })

    renderWithClient(<AjustesContainer />)

    await screen.findByText('Conectado')
    expect(window.api.cli.probe).not.toHaveBeenCalledWith({ provider: 'codex' })
    expect(window.api.cli.probe).not.toHaveBeenCalledWith({ provider: 'antigravity' })
    expect(screen.getByRole('button', { name: `${CONNECT_ACTION} Codex CLI` })).toBeInTheDocument()
  })

  it('probes nothing while the opt-in list is still being read', () => {
    window.api.cli.preferences = vi.fn().mockReturnValue(new Promise(() => {}))

    renderWithClient(<AjustesContainer />)

    expect(window.api.cli.probe).not.toHaveBeenCalled()
  })
})

// Connecting has to be reversible, or the opt-in is a one-way door: a CLI
// connected once would be re-probed on every launch forever.
describe('AjustesContainer — disconnecting', () => {
  async function connectClaude(): Promise<void> {
    window.api.cli.preferences = vi.fn().mockResolvedValue({ ok: true, data: prefs(['claude']) })
    renderWithClient(<AjustesContainer />)
    await screen.findByText('Conectado')
  }

  it('withdraws the opt-in for that CLI only', async () => {
    await connectClaude()

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar Claude Code' }))

    await waitFor(() => expect(window.api.cli.disconnect).toHaveBeenCalledWith({ provider: 'claude' }))
    expect(window.api.cli.disconnect).toHaveBeenCalledTimes(1)
  })

  // A status is something the app observed under a permission that no longer
  // exists, so the row FORGETS it rather than showing it greyed out.
  it('returns the row to idle', async () => {
    await connectClaude()
    window.api.cli.preferences = vi.fn().mockResolvedValue({ ok: true, data: prefs([]) })

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar Claude Code' }))

    expect(await screen.findByRole('button', { name: `${CONNECT_ACTION} Claude Code` })).toBeInTheDocument()
    expect(screen.queryByText('Conectado')).not.toBeInTheDocument()
  })
})
