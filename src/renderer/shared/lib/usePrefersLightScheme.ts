// The CSS half of the light theme is free: the `prefers-color-scheme: light`
// media query in globals.css re-paints every token. Inline styles are the half
// CSS cannot reach — per-row subject colours applied via `style={{...}}` — so
// the components that render them need to KNOW the active scheme and pick the
// mapped hex themselves (see `subjectColorScheme.ts`).
import { useMediaQuery } from './useMediaQuery'

/**
 * True while the OS asks for a light UI. Answers false wherever `matchMedia`
 * is unavailable (jsdom, any pre-render), which lands on dark — the app's
 * default scheme, matching the CSS fallback exactly.
 */
export function usePrefersLightScheme(): boolean {
  return useMediaQuery('(prefers-color-scheme: light)')
}
