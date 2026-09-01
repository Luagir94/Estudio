// Pure, framework-free domain module. Which screen a subject was opened from
// — a carrera's Períodos tab, its Plan de estudios tab, or a período detail —
// so the subject detail's Back label can say where it returns to, the same
// split `carreras/domain/carreraTab.ts` has for its own tab addresses.
//
// This is deliberately WIDER than a two-way carrera/período split: the two
// carrera tabs are already distinct call sites in `router.tsx`, so naming a
// third token costs one literal, not a mechanism, and "Volver a Plan de
// estudios" tells the user where they land instead of making them find out
// by landing.
export type SubjectOrigin = 'periods' | 'plan' | 'periodo'

export const SUBJECT_ORIGINS: SubjectOrigin[] = ['periods', 'plan', 'periodo']

/**
 * Whether an unknown value names a subject origin. The address bar is an
 * untrusted input — a stale or hand-edited `?from=` must fall back to the
 * default label ("Materias") rather than select copy that does not exist.
 */
export function isSubjectOrigin(value: unknown): value is SubjectOrigin {
  return typeof value === 'string' && (SUBJECT_ORIGINS as string[]).includes(value)
}
