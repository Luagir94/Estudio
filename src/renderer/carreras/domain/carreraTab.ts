// Pure, framework-free domain module. Which half of the carrera detail screen
// is showing — the períodos or the plan de estudios — moved out of
// `CarreraDetailContainer`'s own `useState` and into this shared shape so
// `router.tsx` can validate the same `?tab=` values the container renders,
// the same split `materias/domain/subjectStatus.ts`'s filter enum has with
// the Materias screen.
export type CarreraTab = 'periods' | 'plan'

export const CARRERA_TABS: CarreraTab[] = ['periods', 'plan']

/**
 * The tab the screen lands on: períodos, your own timeline, rather than the
 * plan the carrera hands you.
 *
 * Exported because TWO modules have to agree on it — the container, which
 * falls back to it when nothing owns the tab, and `router.tsx`, which resolves
 * an absent `?tab=` into it before the container ever sees the props. Written
 * out twice they could drift, and the address would land on one tab while the
 * screen drew the other.
 */
export const DEFAULT_CARRERA_TAB: CarreraTab = 'periods'

/**
 * Whether an unknown value names a carrera tab. The address bar is an
 * untrusted input — a stale or hand-edited `?tab=` must fall back to the
 * default rather than select a panel that does not exist.
 */
export function isCarreraTab(value: unknown): value is CarreraTab {
  return typeof value === 'string' && (CARRERA_TABS as string[]).includes(value)
}
