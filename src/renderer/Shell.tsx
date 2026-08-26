// The app chrome that every screen renders inside: sidebar, the routed main
// region, and the globally-mounted Ask panel. It is the router's root-route
// component, so it mounts once and survives every navigation — the sidebar
// never remounts, and neither does the Ask panel's open conversation.
//
// The only navigation state left here is DERIVED: which nav item is lit is
// read back out of the current path (`domainFromPathname`) rather than stored.
// Before the router this file held two pieces of real state — `activeDomain`
// and a `handedOverSubjectId` lifted up so Carreras could open a subject that
// lives in Materias — plus the manual "forget the handover on every sidebar
// click" rule that kept the second one from going stale. An address needs
// none of that.
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AskPanelContainer } from './ask/containers/AskPanelContainer'
import { useActiveTerms } from './carreras/containers/useActiveTerms'
import { ROUTE_BY_DOMAIN, domainFromPathname } from './navigation'
import { appApi } from './shared/adapters/appApi'
import { Sidebar } from './shared/components/Sidebar'
import { useMediaQuery } from './shared/lib/useMediaQuery'
import { readSidebarCollapsed, writeSidebarCollapsed, SIDEBAR_FORCED_RAIL_QUERY } from './shared/lib/sidebarPreference'

// The sidebar's "Exportar datos" footer button AND the native File menu's
// `menu:export-requested` push event both call the exact SAME
// `appApi.exportJson()` mutation — "the identical flow" (spec: "Export from
// File menu").
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

export function Shell(): React.JSX.Element {
  const navigate = useNavigate()
  // Subscribing to the pathname ALONE, not to the whole router state: the
  // shell must re-render when you change screens, not on every search-param
  // or loader change a screen makes underneath it.
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const onExport = useExport()
  const sidebar = useSidebarCollapsed()
  const terms = useActiveTerms()

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
          active={domainFromPathname(pathname)}
          onNavigate={(domain) => void navigate({ to: ROUTE_BY_DOMAIN[domain] })}
          onExport={onExport}
          collapsed={sidebar.collapsed}
          onToggleCollapsed={sidebar.toggle}
          terms={terms}
          canToggle={sidebar.canToggle}
        />
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 lg:px-10 lg:py-8">
          <Outlet />
        </main>
      </div>
      {/* Mounted at the Shell, not inside a screen: the corpus it answers from
          is global across every subject, so the panel is available from every
          domain. Navigation is what lets its degraded state hand the user to
          Ajustes instead of dead-ending. */}
      <AskPanelContainer onGoToAjustes={() => void navigate({ to: '/ajustes' })} />
    </>
  )
}
