// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appApi } from './shared/adapters/appApi'
import { App } from './App'

// Every screen is stubbed: this file tests the ROUTER — which screen a path
// mounts, which path a click produces — not what any screen renders. The
// stubs print their params so "Materias, on the list" is distinguishable
// from "Materias, opened into subject 42".
vi.mock('./materias/containers/MateriasListContainer', () => ({
  MateriasListContainer: ({ onSelectSubject }: { onSelectSubject: (id: number) => void }) => (
    <button type="button" onClick={() => onSelectSubject(42)}>
      stub-materias-list
    </button>
  )
}))

vi.mock('./materias/containers/SubjectDetailContainer', () => ({
  SubjectDetailContainer: ({ subjectId, onBack }: { subjectId: number; onBack: () => void }) => (
    <div>
      <p>{`stub-subject-detail:${subjectId}`}</p>
      <button type="button" onClick={onBack}>
        stub-subject-back
      </button>
    </div>
  )
}))

vi.mock('./carreras/containers/CarrerasContainer', () => ({
  CarrerasContainer: ({ onSelectProgram }: { onSelectProgram: (id: number) => void }) => (
    <button type="button" onClick={() => onSelectProgram(3)}>
      stub-carreras-list
    </button>
  )
}))

vi.mock('./carreras/containers/CarreraDetailContainer', () => ({
  CarreraDetailContainer: ({
    programId,
    onSelectPeriod,
    onOpenSubject,
    onBack
  }: {
    programId: number
    onSelectPeriod: (id: number) => void
    onOpenSubject: (id: number) => void
    onBack: () => void
  }) => (
    <div>
      <p>{`stub-carrera-detail:${programId}`}</p>
      <button type="button" onClick={() => onSelectPeriod(9)}>
        stub-select-period
      </button>
      <button type="button" onClick={() => onOpenSubject(7)}>
        stub-open-subject
      </button>
      <button type="button" onClick={onBack}>
        stub-carrera-back
      </button>
    </div>
  )
}))

vi.mock('./carreras/containers/PeriodDetailContainer', () => ({
  PeriodDetailContainer: ({
    programId,
    periodId,
    onOpenSubject,
    onBack
  }: {
    programId: number
    periodId: number
    onOpenSubject: (id: number) => void
    onBack: () => void
  }) => (
    <div>
      <p>{`stub-period-detail:${programId}/${periodId}`}</p>
      <button type="button" onClick={() => onOpenSubject(7)}>
        stub-open-subject-from-period
      </button>
      <button type="button" onClick={onBack}>
        stub-period-back
      </button>
    </div>
  )
}))

vi.mock('./horario/containers/HorarioContainer', () => ({
  HorarioContainer: () => <div>stub-horario-screen</div>
}))

vi.mock('./entregas/containers/EntregasContainer', () => ({
  EntregasContainer: () => <div>stub-entregas-screen</div>
}))

vi.mock('./planificador/containers/PlanificadorContainer', () => ({
  PlanificadorContainer: () => <div>stub-planificador-screen</div>
}))

// Mutable on purpose: the crash-fallback test flips it to make the default
// screen throw during render. Safe with vi.mock hoisting because the stub
// only READS it at render time, long after this module finished evaluating.
let hoyShouldThrow = false

vi.mock('./hoy/containers/HoyContainer', () => ({
  HoyContainer: () => {
    if (hoyShouldThrow) {
      throw new Error('render boom')
    }
    return <div>stub-hoy-screen</div>
  }
}))

vi.mock('./ajustes/containers/AjustesContainer', () => ({
  AjustesContainer: () => <div>stub-ajustes-screen</div>
}))

// Stubbed like every other container here. The real one queries the CLI
// status and cancels on unmount, neither of which belongs in a routing
// test — but the stub still exercises the `onGoToAjustes` wiring.
vi.mock('./ask/containers/AskPanelContainer', () => ({
  AskPanelContainer: ({ onGoToAjustes }: { onGoToAjustes: () => void }) => (
    <button type="button" onClick={onGoToAjustes}>
      stub-ask-go-to-ajustes
    </button>
  )
}))

vi.mock('./shared/adapters/appApi', () => ({
  appApi: { exportJson: vi.fn(), onExportRequested: vi.fn() }
}))

/** Puts the window on a hash location, the way a reload or a deep link would. */
function startAt(hashPath: string): void {
  window.history.replaceState(null, '', `/#${hashPath}`)
}

/**
 * Renders the app and waits for the shell to exist.
 *
 * The router resolves its first match inside a layout effect, so the sidebar
 * is one tick away from `render()` — synchronously querying it right after
 * finds nothing. Waiting on the `<nav>` is waiting on the shell itself, not
 * on any one screen, so this works for every route including the ones that
 * redirect on arrival.
 */
async function renderApp(): Promise<void> {
  render(<App />)
  await screen.findByRole('navigation')
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoyShouldThrow = false
    // The router reads `window.location` when it is created, and jsdom keeps
    // one location per FILE — without this reset each test would start
    // wherever the previous one navigated to.
    window.history.replaceState(null, '', '/')
    vi.mocked(appApi.exportJson).mockResolvedValue({ canceled: true, filePath: null })
    vi.mocked(appApi.onExportRequested).mockReturnValue(vi.fn())
  })

  describe('launch', () => {
    // spec: "Today view on launch" — Hoy renders with zero navigation.
    it('mounts Hoy by default', async () => {
      render(<App />)

      expect(await screen.findByText('stub-hoy-screen')).toBeInTheDocument()
    })

    it('rewrites the bare root path to /hoy so the launch screen has a real address', async () => {
      render(<App />)

      await screen.findByText('stub-hoy-screen')
      expect(window.location.hash).toBe('#/hoy')
    })
  })

  describe('sidebar navigation', () => {
    it.each([
      ['Hoy', 'stub-hoy-screen', '#/hoy'],
      ['Planificador', 'stub-planificador-screen', '#/planificador'],
      ['Materias', 'stub-materias-list', '#/materias'],
      ['Horario', 'stub-horario-screen', '#/horario'],
      ['Entregas', 'stub-entregas-screen', '#/entregas'],
      ['Carreras', 'stub-carreras-list', '#/carreras'],
      ['Ajustes', 'stub-ajustes-screen', '#/ajustes']
    ])('clicking %s mounts its screen and puts %s in the address', async (label, stub, hash) => {
      await renderApp()

      fireEvent.click(screen.getByRole('button', { name: label }))

      expect(await screen.findByText(stub)).toBeInTheDocument()
      expect(window.location.hash).toBe(hash)
    })

    it('marks the current screen as the active page', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Horario' }))
      await screen.findByText('stub-horario-screen')

      expect(screen.getByRole('button', { name: 'Horario' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('button', { name: 'Hoy' })).not.toHaveAttribute('aria-current')
    })

    // A nested screen is still inside its domain — the nav item that owns it
    // must stay lit, or the app looks like it lost track of where you are.
    it('keeps the owning nav item lit on a nested path', async () => {
      startAt('/materias/42')
      render(<App />)
      await screen.findByText('stub-subject-detail:42')

      expect(screen.getByRole('button', { name: 'Materias' })).toHaveAttribute('aria-current', 'page')
    })

    it('sends the Ask panel dead end to Ajustes', async () => {
      await renderApp()

      fireEvent.click(screen.getByText('stub-ask-go-to-ajustes'))

      expect(await screen.findByText('stub-ajustes-screen')).toBeInTheDocument()
    })
  })

  describe('materias routes', () => {
    it('opens a subject from the list into its own address', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Materias' }))
      await screen.findByText('stub-materias-list')

      fireEvent.click(screen.getByText('stub-materias-list'))

      expect(await screen.findByText('stub-subject-detail:42')).toBeInTheDocument()
      expect(window.location.hash).toBe('#/materias/42')
    })

    it('walks back up to the list from a subject', async () => {
      startAt('/materias/42')
      render(<App />)
      await screen.findByText('stub-subject-detail:42')

      fireEvent.click(screen.getByText('stub-subject-back'))

      expect(await screen.findByText('stub-materias-list')).toBeInTheDocument()
    })

    // This is the whole point of the router: the address IS the state, so a
    // reload lands where you were instead of dumping you back on Hoy.
    it('mounts a subject detail directly from the address, the way a reload does', async () => {
      startAt('/materias/42')
      render(<App />)

      expect(await screen.findByText('stub-subject-detail:42')).toBeInTheDocument()
    })

    // A path segment is a string; the old navigation carried real numbers in
    // component state and could never produce this. `Number('abc')` is NaN,
    // and a NaN subject id would go straight out over IPC.
    it('refuses a non-numeric subject id instead of querying for NaN', async () => {
      startAt('/materias/abc')
      render(<App />)

      expect(await screen.findByText('stub-materias-list')).toBeInTheDocument()
      expect(screen.queryByText(/stub-subject-detail/)).not.toBeInTheDocument()
    })
  })

  describe('carreras routes', () => {
    it('drills list -> carrera -> período, one address per level', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Carreras' }))
      await screen.findByText('stub-carreras-list')

      fireEvent.click(screen.getByText('stub-carreras-list'))
      expect(await screen.findByText('stub-carrera-detail:3')).toBeInTheDocument()
      expect(window.location.hash).toBe('#/carreras/3')

      fireEvent.click(screen.getByText('stub-select-period'))
      expect(await screen.findByText('stub-period-detail:3/9')).toBeInTheDocument()
      expect(window.location.hash).toBe('#/carreras/3/periodos/9')
    })

    it('walks a período back to its own carrera, not to the list', async () => {
      startAt('/carreras/3/periodos/9')
      render(<App />)
      await screen.findByText('stub-period-detail:3/9')

      fireEvent.click(screen.getByText('stub-period-back'))

      expect(await screen.findByText('stub-carrera-detail:3')).toBeInTheDocument()
    })

    it('walks a carrera back to the list', async () => {
      startAt('/carreras/3')
      render(<App />)
      await screen.findByText('stub-carrera-detail:3')

      fireEvent.click(screen.getByText('stub-carrera-back'))

      expect(await screen.findByText('stub-carreras-list')).toBeInTheDocument()
    })

    it('refuses a non-numeric carrera id instead of querying for NaN', async () => {
      startAt('/carreras/abc')
      render(<App />)

      expect(await screen.findByText('stub-carreras-list')).toBeInTheDocument()
    })

    it('refuses a non-numeric período id and falls back to its carrera', async () => {
      startAt('/carreras/3/periodos/abc')
      render(<App />)

      expect(await screen.findByText('stub-carrera-detail:3')).toBeInTheDocument()
    })
  })

  describe('cross-domain handover', () => {
    // The one navigation that crosses two top-level domains: the subject
    // lives in Materias, but you asked for it from Carreras. It used to need
    // a `handedOverSubjectId` lifted into the shell; now it is just an address.
    it('opens a subject asked for from a carrera detail', async () => {
      startAt('/carreras/3')
      render(<App />)
      await screen.findByText('stub-carrera-detail:3')

      fireEvent.click(screen.getByText('stub-open-subject'))

      expect(await screen.findByText('stub-subject-detail:7')).toBeInTheDocument()
      expect(window.location.hash).toBe('#/materias/7')
    })

    it('opens a subject asked for from a período detail', async () => {
      startAt('/carreras/3/periodos/9')
      render(<App />)
      await screen.findByText('stub-period-detail:3/9')

      fireEvent.click(screen.getByText('stub-open-subject-from-period'))

      expect(await screen.findByText('stub-subject-detail:7')).toBeInTheDocument()
    })

    // The old handover was sticky state: it had to be explicitly cleared on
    // every sidebar click or Materias would reopen a subject you looked at
    // once, days ago. With an address there is nothing to forget.
    it('does not reopen a handed-over subject on a later visit to Materias', async () => {
      startAt('/carreras/3')
      render(<App />)
      await screen.findByText('stub-carrera-detail:3')
      fireEvent.click(screen.getByText('stub-open-subject'))
      await screen.findByText('stub-subject-detail:7')

      fireEvent.click(screen.getByRole('button', { name: 'Carreras' }))
      await screen.findByText('stub-carreras-list')
      fireEvent.click(screen.getByRole('button', { name: 'Materias' }))

      expect(await screen.findByText('stub-materias-list')).toBeInTheDocument()
    })
  })

  describe('history', () => {
    // The back gesture the app never had: with hash history these are real
    // browser history entries, so Alt+Left and the mouse's back button work
    // without the renderer wiring anything.
    it('goes back to the previous screen', async () => {
      await renderApp()
      await screen.findByText('stub-hoy-screen')
      fireEvent.click(screen.getByRole('button', { name: 'Horario' }))
      await screen.findByText('stub-horario-screen')

      window.history.back()

      await waitFor(() => expect(screen.getByText('stub-hoy-screen')).toBeInTheDocument())
    })

    it('goes forward again after going back', async () => {
      await renderApp()
      await screen.findByText('stub-hoy-screen')
      fireEvent.click(screen.getByRole('button', { name: 'Entregas' }))
      await screen.findByText('stub-entregas-screen')
      window.history.back()
      await waitFor(() => expect(screen.getByText('stub-hoy-screen')).toBeInTheDocument())

      window.history.forward()

      await waitFor(() => expect(screen.getByText('stub-entregas-screen')).toBeInTheDocument())
    })
  })

  describe('export', () => {
    it('clicking "Exportar datos" in the sidebar footer calls appApi.exportJson', async () => {
      await renderApp()

      fireEvent.click(screen.getByRole('button', { name: 'Exportar datos' }))

      await waitFor(() => expect(appApi.exportJson).toHaveBeenCalledTimes(1))
    })

    it('subscribes to onExportRequested once on mount, for the native File menu (identical flow as the sidebar)', async () => {
      await renderApp()

      expect(appApi.onExportRequested).toHaveBeenCalledTimes(1)
    })

    it('the File-menu push event triggers the SAME exportJson() call as the sidebar', async () => {
      let menuCallback: (() => void) | undefined
      vi.mocked(appApi.onExportRequested).mockImplementation((callback) => {
        menuCallback = callback
        return vi.fn()
      })

      await renderApp()
      menuCallback?.()

      await waitFor(() => expect(appApi.exportJson).toHaveBeenCalledTimes(1))
    })
  })

  // Before the root boundary landed, a render throw anywhere in the tree
  // blanked the whole window — the worst possible failure mode for a local
  // desktop app. The boundary must catch it and show translated copy, and it
  // sits ABOVE the router so a throw inside a route is caught too.
  it('shows the Spanish crash fallback instead of a blank window when a screen render throws', async () => {
    hoyShouldThrow = true
    // React reports the caught error via console.error even though the
    // boundary handles it — silence that expected noise for this test only.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<App />)

    expect(await screen.findByText('Algo salió mal')).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
