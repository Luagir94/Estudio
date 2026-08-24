// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appApi } from './shared/adapters/appApi'
import { App } from './App'

// The stub prints the prop so the tests can tell "Materias, on the list"
// apart from "Materias, opened straight into a subject".
vi.mock('./materias/containers/MateriasContainer', () => ({
  MateriasContainer: ({ initialSubjectId }: { initialSubjectId?: number | null }) => (
    <div>{`stub-materias-screen:${initialSubjectId ?? 'lista'}`}</div>
  )
}))

vi.mock('./carreras/containers/CarrerasScreenContainer', () => ({
  CarrerasScreenContainer: ({ onOpenSubject }: { onOpenSubject: (id: number) => void }) => (
    <button type="button" onClick={() => onOpenSubject(7)}>
      stub-open-subject
    </button>
  )
}))

vi.mock('./horario/containers/HorarioContainer', () => ({
  HorarioContainer: () => <div>stub-horario-screen</div>
}))

vi.mock('./entregas/containers/EntregasContainer', () => ({
  EntregasContainer: () => <div>stub-entregas-screen</div>
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
// status and cancels on unmount, neither of which belongs in a Shell
// navigation test — but the stub still exercises the `onGoToAjustes` wiring.
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

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoyShouldThrow = false
    vi.mocked(appApi.exportJson).mockResolvedValue({ canceled: true, filePath: null })
    vi.mocked(appApi.onExportRequested).mockReturnValue(vi.fn())
  })

  // spec: "Today view on launch" — Hoy renders with zero navigation.
  it('mounts Hoy by default', () => {
    render(<App />)

    expect(screen.getByText('stub-hoy-screen')).toBeInTheDocument()
  })

  it('clicking Horario in the sidebar switches the main region to the Horario screen', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Horario' }))

    expect(screen.getByText('stub-horario-screen')).toBeInTheDocument()
    expect(screen.queryByText('stub-hoy-screen')).not.toBeInTheDocument()
  })

  it('clicking Entregas in the sidebar switches the main region to the Entregas screen', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Entregas' }))

    expect(screen.getByText('stub-entregas-screen')).toBeInTheDocument()
    expect(screen.queryByText('stub-hoy-screen')).not.toBeInTheDocument()
  })

  it('clicking Ajustes in the sidebar switches the main region to the Ajustes screen', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }))

    expect(screen.getByText('stub-ajustes-screen')).toBeInTheDocument()
    expect(screen.queryByText('stub-hoy-screen')).not.toBeInTheDocument()
  })

  it('clicking Materias in the sidebar switches the main region to the Materias screen', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Materias' }))

    expect(screen.getByText('stub-materias-screen:lista')).toBeInTheDocument()
  })

  // The first navigation that crosses two top-level domains: the subject
  // lives in Materias, but you asked for it from Carreras.
  it('opening a subject from Carreras lands on its detail in Materias', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Carreras' }))
    fireEvent.click(screen.getByText('stub-open-subject'))

    expect(screen.getByText('stub-materias-screen:7')).toBeInTheDocument()
  })

  // Otherwise the handover would be sticky: every later visit to Materias
  // would reopen the subject you looked at once, days ago.
  it('forgets that subject once you navigate by sidebar again', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Carreras' }))
    fireEvent.click(screen.getByText('stub-open-subject'))

    fireEvent.click(screen.getByRole('button', { name: 'Carreras' }))
    fireEvent.click(screen.getByRole('button', { name: 'Materias' }))

    expect(screen.getByText('stub-materias-screen:lista')).toBeInTheDocument()
  })

  it('clicking "Exportar datos" in the sidebar footer calls appApi.exportJson', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Exportar datos' }))

    await waitFor(() => expect(appApi.exportJson).toHaveBeenCalledTimes(1))
  })

  it('subscribes to onExportRequested once on mount, for the native File menu (identical flow as the sidebar)', () => {
    render(<App />)

    expect(appApi.onExportRequested).toHaveBeenCalledTimes(1)
  })

  // Before the root boundary landed, a render throw anywhere in the tree
  // blanked the whole window — the worst possible failure mode for a local
  // desktop app. The boundary must catch it and show translated copy.
  it('shows the Spanish crash fallback instead of a blank window when a screen render throws', () => {
    hoyShouldThrow = true
    // React reports the caught error via console.error even though the
    // boundary handles it — silence that expected noise for this test only.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<App />)

    expect(screen.getByText('Algo salió mal')).toBeInTheDocument()
    consoleError.mockRestore()
  })

  it('the File-menu push event triggers the SAME exportJson() call as the sidebar button', async () => {
    let menuCallback: (() => void) | undefined
    vi.mocked(appApi.onExportRequested).mockImplementation((callback) => {
      menuCallback = callback
      return vi.fn()
    })

    render(<App />)
    menuCallback?.()

    await waitFor(() => expect(appApi.exportJson).toHaveBeenCalledTimes(1))
  })
})
