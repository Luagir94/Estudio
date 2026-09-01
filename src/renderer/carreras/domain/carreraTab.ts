// Pure, framework-free domain module. Which half of the carrera detail screen
// is showing — the períodos or the plan de estudios — moved out of
// `CarreraDetailContainer`'s own `useState` and into this shared shape so
// `router.tsx` can validate the same `?tab=` values the container renders,
// the same split `materias/domain/subjectStatus.ts`'s filter enum has with
// the Materias screen.
export type CarreraTab = 'periods' | 'plan'

export const CARRERA_TABS: CarreraTab[] = ['periods', 'plan']

/**
 * Whether an unknown value names a carrera tab. The address bar is an
 * untrusted input — a stale or hand-edited `?tab=` must fall back to the
 * default rather than select a panel that does not exist.
 */
export function isCarreraTab(value: unknown): value is CarreraTab {
  return typeof value === 'string' && (CARRERA_TABS as string[]).includes(value)
}
