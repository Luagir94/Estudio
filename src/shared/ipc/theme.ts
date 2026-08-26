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

/**
 * The colour palettes, in the order the settings screen offers them (approved
 * `.pen`, node `Empor` "Palette Menu").
 *
 * A palette is the SECOND theming axis, orthogonal to the preference above.
 * The preference decides light or dark; the palette decides which set of
 * chrome and accent tokens that scheme paints with. The design file models it
 * the same way — a `palette` theme axis alongside `mode` — and both axes
 * resolve independently, so all twelve combinations are real.
 *
 * These ids are NOT display names. They are the values written to
 * `<html data-palette="…">`, which is what `globals.css` keys its override
 * blocks on, and they are what the settings row persists. Renaming one here
 * would compile fine and silently paint the base palette instead, because a
 * `[data-palette]` selector nobody matches is not an error — which is why
 * `theme.test.ts` pins the list.
 */
export const paletteSchema = z.enum(['amatista', 'cobalto', 'turquesa', 'cuarzo', 'malva', 'grafito'])

export type Palette = z.infer<typeof paletteSchema>

export const PALETTES: readonly Palette[] = ['amatista', 'cobalto', 'turquesa', 'cuarzo', 'malva', 'grafito']

/**
 * What a profile that never chose gets. `amatista` is the palette the app
 * shipped with, and it is the one written into the base token block rather
 * than into a `[data-palette]` override — so an unset attribute and this
 * value paint the identical screen, and there is no flash before the stored
 * choice is read.
 */
export const DEFAULT_PALETTE: Palette = 'amatista'

export const setPaletteInputSchema = z.object({
  palette: paletteSchema
})

export type SetPaletteInput = z.infer<typeof setPaletteInputSchema>
