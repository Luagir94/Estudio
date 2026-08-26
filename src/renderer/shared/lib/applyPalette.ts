// The renderer half of the palette axis: putting the chosen palette on
// `<html data-palette="…">`, which is the selector `globals.css` keys its
// override blocks on.
//
// This is the palette's counterpart to what `nativeTheme.themeSource` does
// for light/dark, and the asymmetry is deliberate. A theme preference changes
// how `prefers-color-scheme` RESOLVES, which only the main process can do; a
// palette changes nothing but which token block wins, so it never leaves the
// document. That is why `themeService` persists a palette but applies none.
import { DEFAULT_PALETTE, paletteSchema, type Palette } from '../../../shared/ipc/theme'

/**
 * Writes the palette onto the document element.
 *
 * The DEFAULT is written as an attribute like any other rather than removed.
 * It resolves identically either way — `amatista` has no override block, so
 * an absent attribute and `data-palette="amatista"` paint the same screen —
 * and an attribute that is always present is one an inspector can read back,
 * which is what the tests below assert against.
 */
export function applyPalette(palette: Palette): void {
  document.documentElement.dataset.palette = palette
}

/**
 * Reads the persisted palette across the bridge, degrading to the default
 * rather than propagating.
 *
 * Every other adapter in the renderer THROWS on a failed envelope, and that is
 * right for a screen that can show the error. This one runs before the first
 * paint, where there is no screen yet and nothing to show it on: a settings
 * read that failed must cost the student the palette they chose, never the
 * app. The main side already degrades a drifted row to the default; this
 * covers the envelope failing outright.
 */
export async function readStoredPalette(): Promise<Palette> {
  try {
    const result = await window.api.theme.getPalette()
    if (!result.ok) {
      return DEFAULT_PALETTE
    }
    // Parsed on this side too (design §2's two-directional rule): the value is
    // about to become a DOM attribute, and an unrecognized one would paint the
    // base palette silently instead of failing.
    return paletteSchema.safeParse(result.data).data ?? DEFAULT_PALETTE
  } catch {
    return DEFAULT_PALETTE
  }
}

/**
 * Boot step: read last session's palette and put it on the document BEFORE the
 * first render. Awaited in `main.tsx` rather than fired off, which is what
 * buys the one thing a `useEffect` could not — no frame painted in amatista
 * on the way to the palette the student actually chose.
 */
export async function applyStoredPalette(): Promise<Palette> {
  const palette = await readStoredPalette()
  applyPalette(palette)
  return palette
}
