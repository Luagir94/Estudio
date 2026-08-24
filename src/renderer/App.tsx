// Slice 2a mounted the first real screen. Full routing (TanStack Router
// with memoryHistory, design §4) still lands once deep-linked navigation is
// needed — for now, top-level domain switching uses local state, same
// precedent as MateriasContainer's list<->detail nav.
//
// Hoy is the default screen (spec: "Today view on launch" — zero
// navigation). The sidebar's "Exportar datos" footer button AND the native
// File menu's `menu:export-requested` push event both call the exact SAME
// `appApi.exportJson()` mutation here — "the identical flow" (spec: "Export
// from File menu").
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { AjustesContainer } from './ajustes/containers/AjustesContainer'
import { AskPanelContainer } from './ask/containers/AskPanelContainer'
import { CarrerasScreenContainer } from './carreras/containers/CarrerasScreenContainer'
import { useActiveTerms } from './carreras/containers/useActiveTerms'
import { EntregasContainer } from './entregas/containers/EntregasContainer'
import { HorarioContainer } from './horario/containers/HorarioContainer'
import { HoyContainer } from './hoy/containers/HoyContainer'
import { MateriasContainer } from './materias/containers/MateriasContainer'
import { appApi } from './shared/adapters/appApi'
import { ErrorBoundary } from './shared/components/ErrorBoundary'
import { Sidebar, type SidebarDomain } from './shared/components/Sidebar'
import { createQueryClient } from './shared/lib/queryClient'
import { useMediaQuery } from './shared/lib/useMediaQuery'
import { readSidebarCollapsed, writeSidebarCollapsed, SIDEBAR_FORCED_RAIL_QUERY } from './shared/lib/sidebarPreference'

const queryClient = createQueryClient()

function useExport(): () => void {
  const handleExport = (): void => {
    void appApi.exportJson()
  }

  useEffect(() => {
    return appApi.onExportRequested(handleExport)
  }, [])

  return handleExport
}

/**
 * The sidebar answers to two inputs, and only one of them is the user's.
 *
 * The stored preference is what they chose; the window width is a hard
 * constraint. Below the breakpoint the rail is forced, WITHOUT overwriting
 * the preference — resizing the window back up restores exactly the sidebar
 * the user had, instead of silently rewriting their choice.
 */
function useSidebarCollapsed(): { collapsed: boolean; canToggle: boolean; toggle: () => void } {
  const forcedRail = useMediaQuery(SIDEBAR_FORCED_RAIL_QUERY)
  const [preferCollapsed, setPreferCollapsed] = useState(readSidebarCollapsed)

  const toggle = (): void => {
    setPreferCollapsed((previous) => {
      const next = !previous
      writeSidebarCollapsed(next)
      return next
    })
  }

  return { collapsed: forcedRail || preferCollapsed, canToggle: !forcedRail, toggle }
}

// Split out of `App` because `useActiveTerms` calls `useQuery`, which needs a
// QueryClientProvider ABOVE it — and `App` is the component that renders the
// provider, so it cannot consume one itself.
function Shell(): React.JSX.Element {
  const [activeDomain, setActiveDomain] = useState<SidebarDomain>('hoy')
  // Cross-screen handover, NOT a router: the only navigation that crosses
  // two domains is "open this subject", asked for from Carreras and served
  // by Materias. Lifting that one id here beats a router the rest of the app
  // does not need yet — but it is the second deferral, so the third one
  // (deep links, back button, restore) is where TanStack Router lands.
  const [handedOverSubjectId, setHandedOverSubjectId] = useState<number | null>(null)
  const onExport = useExport()
  const sidebar = useSidebarCollapsed()
  const terms = useActiveTerms()

  // Sidebar navigation drops the handover: without this, every later visit
  // to Materias would remount straight into a subject you opened once.
  const handleNavigate = (domain: SidebarDomain): void => {
    setHandedOverSubjectId(null)
    setActiveDomain(domain)
  }

  const handleOpenSubject = (id: number): void => {
    setHandedOverSubjectId(id)
    setActiveDomain('materias')
  }

  return (
    <>
      {/* `w-full` rather than `w-screen`: `w-screen` is 100vw, which IGNORES
          the vertical scrollbar and pushes the layout a scrollbar's width past
          the window — the horizontal scrollbar that showed up on every screen.
          `min-w-0` on the main region is the other half: without it a flex
          child refuses to shrink below its content, so one wide table forced
          the whole window to scroll sideways instead of scrolling itself. */}
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar
          active={activeDomain}
          onNavigate={handleNavigate}
          onExport={onExport}
          collapsed={sidebar.collapsed}
          onToggleCollapsed={sidebar.toggle}
          terms={terms}
          canToggle={sidebar.canToggle}
        />
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 lg:px-10 lg:py-8">
          {activeDomain === 'horario' ? (
            <HorarioContainer />
          ) : activeDomain === 'entregas' ? (
            <EntregasContainer />
          ) : activeDomain === 'materias' ? (
            <MateriasContainer
              initialSubjectId={handedOverSubjectId}
              onGoToCarreras={() => handleNavigate('carreras')}
            />
          ) : activeDomain === 'carreras' ? (
            <CarrerasScreenContainer onOpenSubject={handleOpenSubject} />
          ) : activeDomain === 'ajustes' ? (
            <AjustesContainer />
          ) : (
            <HoyContainer />
          )}
        </main>
      </div>
      {/* Mounted at the Shell, not inside a screen: the corpus it answers from
          is global across every subject, so the panel is available from every
          domain. `handleNavigate` is what lets its degraded state hand the
          user to Ajustes instead of dead-ending. */}
      <AskPanelContainer onGoToAjustes={() => handleNavigate('ajustes')} />
    </>
  )
}

// The boundary sits OUTSIDE the QueryClientProvider: a crash in the provider
// or any query plumbing is exactly the failure it must survive. Nothing
// needs to sit above it — i18next is a synchronous singleton (see
// i18n/index.ts), not a provider, so the fallback can translate from the
// very top of the tree.
export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Shell />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
