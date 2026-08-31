// The renderer's navigation composition root — the one place that knows the
// whole map of the app. It is the counterpart of `bootstrap()` on the main
// side, and it lives at the renderer root rather than in `shared/` for the
// reason the Sidebar states about itself: naming all seven domains is exactly
// what a shared module must not do.
//
// HASH history, not memory history (the earlier plan in `App.tsx`'s deviation
// note). Memory history keeps the route in a variable, which fixes neither of
// the two things the ad-hoc navigation actually lacked: a reload still lands
// on Hoy, and the back gesture still does nothing. A hash keeps every screen
// in `window.history`, so reloading resumes where you were and Alt+Left and
// the mouse's back button work with no renderer wiring at all. It is free of
// the packaged app's constraints too: the window loads over `file://`, where
// a path-based history has no server to fall back on, and the main process's
// `will-navigate` lockdown compares origin and pathname (`window.ts`), neither
// of which a hash touches — so nothing in the security baseline had to move.
//
// Routes are declared FLAT, one per screen with its full path, instead of
// nested under a layout route per domain. There is no per-domain chrome to
// hang off a layout — the only shared frame is the Shell at the root — so
// nesting would buy indentation and cost the ability to read every address
// the app can be at in one column.
//
// The route components below are thin adapters, and deliberately so: they
// translate a path into the props the feature containers already take
// (`subjectId`, `onBack`, `onSelectPeriod`, ...). The containers stay
// prop-driven and router-unaware, which is what keeps them testable without
// a router and keeps the router the only module that has to change when an
// address does.
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useNavigate,
  type RouterHistory
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { CrashFallback } from './shared/components/CrashFallback'
import { AjustesContainer } from './ajustes/containers/AjustesContainer'
import { CarreraDetailContainer } from './carreras/containers/CarreraDetailContainer'
import { CarrerasContainer } from './carreras/containers/CarrerasContainer'
import { PeriodDetailContainer } from './carreras/containers/PeriodDetailContainer'
import { EntregasContainer } from './entregas/containers/EntregasContainer'
import { HorarioContainer } from './horario/containers/HorarioContainer'
import { HoyContainer } from './hoy/containers/HoyContainer'
import { isSubjectDetailTabId, type SubjectDetailTabId } from './materias/components/SubjectDetailTabs'
import { MateriasListContainer } from './materias/containers/MateriasListContainer'
import { SubjectDetailContainer } from './materias/containers/SubjectDetailContainer'
import { isSubjectStatusFilter, type SubjectStatusFilter } from './materias/domain/subjectStatus'
import { parseRouteId } from './navigation'
import { PlanificadorContainer } from './planificador/containers/PlanificadorContainer'
import { Shell } from './Shell'

/**
 * Turns a raw `$id` segment into the number a container expects, or `NaN` for
 * anything that is not an id.
 *
 * It never throws: `params.parse` runs while the router is still deciding
 * which route matched, and a throw there is a router-internal error rather
 * than a navigation. Each route's `beforeLoad` is where the bad value becomes
 * a redirect, because that is the phase that is allowed to change where you
 * are going.
 */
function idParam(raw: string | undefined): number {
  return parseRouteId(raw ?? '') ?? Number.NaN
}

/** Whether `idParam` produced a usable id rather than its `NaN` sentinel. */
function isId(value: number): boolean {
  return Number.isSafeInteger(value)
}

// Each `beforeLoad` below spells its own fallback out rather than calling a
// shared "redirect unless valid" helper. A helper would have to take the
// redirect target as a plain argument, and that is exactly what erases the
// library's link between a path and the params it requires — the one check
// that makes `/carreras/$programId` impossible to redirect to without a
// `programId`. Three explicit guards keep that guarantee.
//
// `replace` on every one of them: a malformed address must not become a
// history entry, or going back would land on it and immediately redirect
// forward again — a back button that refuses to go back.

const rootRoute = createRootRoute({ component: Shell })

// The bare `/` the window loads with is not a screen — it is rewritten to
// Hoy's real address so that "the launch screen" and "the screen you can
// reload into" are the same thing. `replace` keeps it out of history.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/hoy', replace: true })
  }
})

const hoyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/hoy', component: HoyContainer })

const planificadorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/planificador',
  component: PlanificadorContainer
})

const horarioRoute = createRoute({ getParentRoute: () => rootRoute, path: '/horario', component: HorarioContainer })

const entregasRoute = createRoute({ getParentRoute: () => rootRoute, path: '/entregas', component: EntregasContainer })

const ajustesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/ajustes', component: AjustesContainer })

// ---------------------------------------------------------------- materias

function MateriasListScreen(): React.JSX.Element {
  const navigate = useNavigate()
  const { filtro } = materiasRoute.useSearch()
  return (
    <MateriasListContainer
      filter={filtro}
      // `replace`, so scanning the filter chips does not bury the screen you
      // came from under six history entries — the back gesture should leave
      // Materias, not walk back through how you looked at it.
      onFilterChange={(next) => void navigate({ to: '/materias', search: { filtro: next }, replace: true })}
      onSelectSubject={(subjectId) => void navigate({ to: '/materias/$subjectId', params: { subjectId } })}
      onGoToCarreras={() => void navigate({ to: '/carreras' })}
    />
  )
}

// The search params below are VALIDATED, not merely read: the address is an
// untrusted input (a stale hash from a previous build, a hand-edited URL), and
// an unrecognised value must resolve to the screen's default rather than to a
// filter that matches nothing or a tab panel that does not exist.
//
// The key is set to `undefined` rather than omitted, and that distinction is
// load-bearing. Search params are INHERITED down the route tree and a child's
// validated result is MERGED over its parents', so returning `{}` leaves the
// raw value showing through from the root — `?filtro=inventado` arrived at the
// container verbatim. Naming the key is what overrides it.
const materiasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/materias',
  // The return TYPE keeps `filtro` optional while the returned OBJECT always
  // carries the key: optional is what lets `navigate({ to: '/materias' })` stay
  // a one-liner instead of every call site having to name a search it does not
  // care about, and the always-present key is what does the overriding.
  validateSearch: (search: Record<string, unknown>): { filtro?: SubjectStatusFilter } => ({
    filtro: isSubjectStatusFilter(search.filtro) ? search.filtro : undefined
  }),
  component: MateriasListScreen
})

function SubjectDetailScreen(): React.JSX.Element {
  const { subjectId } = subjectDetailRoute.useParams()
  const { tab } = subjectDetailRoute.useSearch()
  const navigate = useNavigate()
  // Back goes UP to the list, not back through history. It is the same
  // destination this button had before the router, and a fixed one: an
  // in-screen control that lands somewhere different depending on how you
  // arrived is a control you cannot learn. History is the back GESTURE's job,
  // and that now works too.
  return (
    <SubjectDetailContainer
      subjectId={subjectId}
      activeTab={tab}
      // `replace` for the same reason the filter uses it: switching sections
      // inside one subject is looking around, not travelling, and four tabs
      // would otherwise put four entries between you and the list.
      onTabChange={(next) =>
        void navigate({ to: '/materias/$subjectId', params: { subjectId }, search: { tab: next }, replace: true })
      }
      onBack={() => void navigate({ to: '/materias' })}
    />
  )
}

const subjectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/materias/$subjectId',
  // Optional in the type, always present in the object — same reasoning as
  // `materiasRoute` above.
  validateSearch: (search: Record<string, unknown>): { tab?: SubjectDetailTabId } => ({
    tab: isSubjectDetailTabId(search.tab) ? search.tab : undefined
  }),
  params: {
    parse: (raw: Record<string, string>) => ({ subjectId: idParam(raw.subjectId) }),
    stringify: ({ subjectId }: { subjectId: number }) => ({ subjectId: String(subjectId) })
  },
  beforeLoad: ({ params }) => {
    if (!isId(params.subjectId)) {
      throw redirect({ to: '/materias', replace: true })
    }
  },
  component: SubjectDetailScreen
})

// ---------------------------------------------------------------- carreras

function CarrerasListScreen(): React.JSX.Element {
  const navigate = useNavigate()
  return (
    <CarrerasContainer
      onSelectProgram={(programId) => void navigate({ to: '/carreras/$programId', params: { programId } })}
    />
  )
}

const carrerasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/carreras',
  component: CarrerasListScreen
})

function CarreraDetailScreen(): React.JSX.Element {
  const { programId } = carreraDetailRoute.useParams()
  const navigate = useNavigate()
  return (
    <CarreraDetailContainer
      programId={programId}
      onBack={() => void navigate({ to: '/carreras' })}
      onSelectPeriod={(periodId) =>
        void navigate({ to: '/carreras/$programId/periodos/$periodId', params: { programId, periodId } })
      }
      onOpenSubject={(subjectId) => void navigate({ to: '/materias/$subjectId', params: { subjectId } })}
    />
  )
}

const carreraDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/carreras/$programId',
  params: {
    parse: (raw: Record<string, string>) => ({ programId: idParam(raw.programId) }),
    stringify: ({ programId }: { programId: number }) => ({ programId: String(programId) })
  },
  beforeLoad: ({ params }) => {
    if (!isId(params.programId)) {
      throw redirect({ to: '/carreras', replace: true })
    }
  },
  component: CarreraDetailScreen
})

function PeriodDetailScreen(): React.JSX.Element {
  const { programId, periodId } = periodDetailRoute.useParams()
  const navigate = useNavigate()
  return (
    <PeriodDetailContainer
      programId={programId}
      periodId={periodId}
      // Up to the carrera this período belongs to, not to the carreras list:
      // the período screen was always reached THROUGH a carrera, and the
      // address now carries which one instead of a second state variable.
      onBack={() => void navigate({ to: '/carreras/$programId', params: { programId } })}
      onOpenSubject={(subjectId) => void navigate({ to: '/materias/$subjectId', params: { subjectId } })}
    />
  )
}

// The período id is nested UNDER its carrera in the path rather than sitting
// beside it as a sibling screen, because a período has no meaning without one
// — the old navigation had to keep both ids in state and hand-clear the
// período whenever the carrera changed, precisely because the two were only
// related by convention. The path makes the relationship structural: a bad
// período falls back to its carrera, and a bad carrera takes the período with
// it to the list.
const periodDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/carreras/$programId/periodos/$periodId',
  params: {
    parse: (raw: Record<string, string>) => ({
      programId: idParam(raw.programId),
      periodId: idParam(raw.periodId)
    }),
    stringify: ({ programId, periodId }: { programId: number; periodId: number }) => ({
      programId: String(programId),
      periodId: String(periodId)
    })
  },
  beforeLoad: ({ params }) => {
    if (!isId(params.programId)) {
      throw redirect({ to: '/carreras', replace: true })
    }
    // Falls back to the carrera, not to the list: the carrera half of the
    // address is still good, so there is a more specific place to land.
    if (!isId(params.periodId)) {
      throw redirect({ to: '/carreras/$programId', params: { programId: params.programId }, replace: true })
    }
  },
  component: PeriodDetailScreen
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  hoyRoute,
  planificadorRoute,
  materiasRoute,
  subjectDetailRoute,
  horarioRoute,
  entregasRoute,
  carrerasRoute,
  carreraDetailRoute,
  periodDetailRoute,
  ajustesRoute
])

/**
 * A FACTORY, not a module-level singleton, so each `<App />` mount gets its
 * own router. A shared instance would carry one test's location into the
 * next, and the app itself only ever creates one.
 *
 * `history` is injectable for the same reason: a caller that must not touch
 * `window.location` can hand in a memory history instead.
 */
export function createAppRouter(history: RouterHistory = createHashHistory()) {
  return createRouter({
    routeTree,
    history,
    // The routes are pure component switches — nothing here loads data, since
    // every screen fetches through TanStack Query. Without this, the router
    // would hold the old screen on screen while it "pends" on nothing.
    defaultPendingMs: 0,
    // Anything the tree does not own resolves to the launch screen instead of
    // a blank main region. The window has no address bar, so an unknown path
    // can only come from a stale hash — not something to explain, something
    // to recover from.
    notFoundMode: 'root',
    defaultNotFoundComponent: NotFoundRedirect,
    // The router wraps every routed screen in its OWN error boundary, which
    // catches a screen's render throw before the root `ErrorBoundary` can
    // ever see it. Without this the user would get the library's developer
    // error card — raw message and a "Hide Error" button — in place of the
    // app's translated fallback.
    defaultErrorComponent: CrashFallback
  })
}

function NotFoundRedirect(): null {
  const navigate = useNavigate()
  // In an effect, not during render: navigating is a side effect, and doing
  // it inline would mutate router state while React is rendering it.
  useEffect(() => {
    void navigate({ to: '/hoy', replace: true })
  }, [navigate])
  return null
}

// Registers the route tree with the library's type system, which is what
// makes `to: '/materias/$subjectId'` and its `params` checked at compile time
// instead of being strings that fail in front of the user.
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
