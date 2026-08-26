// The two-way map between the sidebar's domains and the router's paths.
//
// It lives at the renderer ROOT, not in `shared/`, for the same reason the
// route tree does: it has to name all seven domains, and `shared/` must not
// learn a feature's vocabulary (see the Sidebar's own note on that). This
// file is part of the renderer's composition root, the counterpart of
// `bootstrap()` on the main side.
//
// Keeping the reverse direction as a function rather than a second literal
// is what lets a nested path stay lit: `/materias/42` is still Materias, and
// `/carreras/3/periodos/9` is still Carreras.
import type { SidebarDomain } from './shared/components/Sidebar'

/**
 * Where each sidebar item navigates to.
 *
 * `as const` is load-bearing, not decoration: it keeps the values as literal
 * types instead of widening them to `string`, which is what lets
 * `navigate({ to: ROUTE_BY_DOMAIN[domain] })` typecheck against the router's
 * union of known paths. Widened to `string`, every sidebar click would need a
 * cast and a typo would only surface at runtime.
 */
export const ROUTE_BY_DOMAIN = {
  hoy: '/hoy',
  planificador: '/planificador',
  materias: '/materias',
  horario: '/horario',
  entregas: '/entregas',
  carreras: '/carreras',
  ajustes: '/ajustes'
} as const satisfies Record<SidebarDomain, string>

const DOMAINS = Object.keys(ROUTE_BY_DOMAIN) as SidebarDomain[]

/**
 * Reads a row id out of a raw path segment, or `null` when the segment is
 * not one.
 *
 * This guard is new debt paid, not ceremony. The navigation it replaces
 * carried real `number`s in component state, so a container could never be
 * handed anything else; a path segment is always a string, and `Number('abc')`
 * is `NaN` — which would sail into a query key and out over IPC. The regex is
 * deliberately stricter than `Number()`: no signs, no decimals, no
 * exponents, no whitespace, no leading zeros, so exactly one path spells any
 * given id and the back button cannot land on a second spelling of the screen
 * you just left. The final bound rejects ids past `Number.MAX_SAFE_INTEGER`,
 * where `Number()` silently rounds to a *different* id.
 */
export function parseRouteId(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) {
    return null
  }
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : null
}

/**
 * Which nav item owns a pathname — the sidebar's `active` prop.
 *
 * Falls back to `hoy` for anything unrecognized, including `/`: Hoy is the
 * launch screen, and a sidebar with NO active item reads as a broken app
 * rather than as an unknown route.
 */
export function domainFromPathname(pathname: string): SidebarDomain {
  const [segment] = pathname.replace(/^\/+/, '').split('/')
  return DOMAINS.find((domain) => domain === segment) ?? 'hoy'
}
