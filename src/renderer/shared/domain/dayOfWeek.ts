// Pure, framework-free domain module (design §4). Explicit, tested mapping
// between the stored `dayOfWeek` (JS `Date.getDay()` semantics: 0=Sunday..
// 6=Saturday, see src/main/db/schema.ts) and the Monday-first display order
// required by the Horario grid and the "Hoy" week strip (spec: "Week Strip
// Starts Monday"). Written down explicitly per the slice-2a gate finding
// (sdd/course-companion/gate-findings/slice-2a, Finding 2) so slice 3's
// weekly-schedule projection does not have to re-derive it.

/**
 * Maps a stored Sunday-based `dayOfWeek` (0=Sunday..6=Saturday) to its
 * position in a Monday-first display order (0=Monday..6=Sunday). Sunday is
 * the special case: it moves from index 0 (JS convention) to index 6 (last
 * position in a Monday-first week).
 */
export function toMondayFirstIndex(dayOfWeek: number): number {
  return (dayOfWeek + 6) % 7
}

/**
 * Inverse of {@link toMondayFirstIndex}: maps a Monday-first display index
 * (0=Monday..6=Sunday) back to the stored Sunday-based `dayOfWeek`.
 */
export function fromMondayFirstIndex(mondayFirstIndex: number): number {
  return (mondayFirstIndex + 1) % 7
}
