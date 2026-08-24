// Shared contract for the `theme:*` channels. Parsed on BOTH sides, matching
// the two-sided-parsing convention (`src/shared/ipc/materias.ts`).
//
// The three values are Electron's own `nativeTheme.themeSource` union,
// VERBATIM — not app-invented names mapped at the boundary. The renderer's
// entire theming hangs off `prefers-color-scheme`, and `themeSource` is the
// one Electron switch that changes how that media query resolves, so a parsed
// preference is assigned to it directly. Renaming a value here would compile
// fine and break the assignment at runtime, which is why the identity is
// pinned by `theme.test.ts` rather than trusted.
import { z } from 'zod'

export const themePreferenceSchema = z.enum(['system', 'light', 'dark'])

export type ThemePreference = z.infer<typeof themePreferenceSchema>

/** The order the settings screen offers them in — approved design, left to right. */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

/**
 * What a profile that never chose gets: exactly Electron's own default, so
 * the app behaves identically before and after this preference existed.
 * Also the read-side fallback for a settings row this schema refuses.
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system'

export const setThemePreferenceInputSchema = z.object({
  preference: themePreferenceSchema
})

export type SetThemePreferenceInput = z.infer<typeof setThemePreferenceInputSchema>
