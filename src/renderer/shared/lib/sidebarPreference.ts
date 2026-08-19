// Whether the sidebar is collapsed is a PREFERENCE, not screen state: you
// collapse it once and expect it to still be collapsed tomorrow. It lives in
// localStorage rather than the SQLite store because it describes this window,
// not the user's academic data — nothing here belongs in the JSON export.
const STORAGE_KEY = 'sidebar:collapsed'

/**
 * Below this window width the expanded sidebar (232px) eats too much of the
 * window to be worth its labels, so the rail is FORCED regardless of the
 * stored preference (design: "Grupo — Responsive", regla `< 1100 px`).
 */
export const SIDEBAR_COLLAPSE_BREAKPOINT_PX = 1100

/** Media query that is true exactly when the rail is forced. */
export const SIDEBAR_FORCED_RAIL_QUERY = `(max-width: ${SIDEBAR_COLLAPSE_BREAKPOINT_PX - 1}px)`

/**
 * Reads the stored preference. Any failure answers "expanded": storage can be
 * unavailable or hold garbage, and neither is a reason to boot into a
 * degraded layout.
 */
export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Persists the preference. A storage failure is not worth crashing a render over. */
export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed))
  } catch {
    // Ignored on purpose: the app works fine with an unpersisted preference.
  }
}
