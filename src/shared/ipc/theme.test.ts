import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PALETTE,
  DEFAULT_THEME_PREFERENCE,
  PALETTES,
  paletteSchema,
  setPaletteInputSchema,
  setThemePreferenceInputSchema,
  THEME_PREFERENCES,
  themePreferenceSchema
} from './theme'

// The three values are not app-invented names: they are Electron's own
// `nativeTheme.themeSource` union, verbatim. These tests pin that identity,
// because the whole design rests on assigning a parsed preference straight to
// `themeSource` with no mapping layer in between.

describe('themePreferenceSchema', () => {
  it.each(['system', 'light', 'dark'] as const)('accepts %s', (preference) => {
    expect(themePreferenceSchema.parse(preference)).toBe(preference)
  })

  // A drifted or hand-edited settings row must degrade to the default on the
  // read side, so the schema has to REFUSE it rather than pass it through to
  // an Electron property that would throw on assignment.
  it.each(['auto', 'oscuro', '', 'DARK', 1, null, undefined])('refuses %j', (value) => {
    expect(themePreferenceSchema.safeParse(value).success).toBe(false)
  })
})

describe('THEME_PREFERENCES', () => {
  it('lists the three preferences in the segmented control order', () => {
    expect(THEME_PREFERENCES).toEqual(['system', 'light', 'dark'])
  })
})

describe('DEFAULT_THEME_PREFERENCE', () => {
  // 'system' is what Electron does when nobody has ever chosen: the app must
  // behave identically before and after this feature existed for a user who
  // never opens the control.
  it('is system', () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('system')
  })
})

describe('setThemePreferenceInputSchema', () => {
  it('parses a named preference', () => {
    expect(setThemePreferenceInputSchema.parse({ preference: 'dark' })).toEqual({ preference: 'dark' })
  })

  it.each([
    ['an empty payload', {}],
    ['no payload at all', undefined],
    ['a preference outside the union', { preference: 'sepia' }]
  ])('refuses %s', (_label, payload) => {
    expect(setThemePreferenceInputSchema.safeParse(payload).success).toBe(false)
  })
})

// The palette ids double as the `<html data-palette="…">` values that
// `globals.css` keys its override blocks on. A drifted id is invisible at
// runtime — an unmatched attribute selector simply paints the base palette —
// so the list is pinned here rather than trusted.

describe('paletteSchema', () => {
  it.each(['amatista', 'cobalto', 'turquesa', 'cuarzo', 'malva', 'grafito'] as const)('accepts %s', (palette) => {
    expect(paletteSchema.parse(palette)).toBe(palette)
  })

  it.each(['violeta', 'oceano', '', 'Amatista', 'system', 1, null, undefined])('refuses %j', (value) => {
    expect(paletteSchema.safeParse(value).success).toBe(false)
  })
})

describe('PALETTES', () => {
  it('lists the six palettes in the approved menu order', () => {
    expect(PALETTES).toEqual(['amatista', 'cobalto', 'turquesa', 'cuarzo', 'malva', 'grafito'])
  })

  it('holds exactly the values the schema accepts', () => {
    expect([...PALETTES].sort()).toEqual([...paletteSchema.options].sort())
  })
})

describe('DEFAULT_PALETTE', () => {
  // `amatista` is the palette written into the BASE token block, not into a
  // `[data-palette]` override. An unset attribute and this value must paint
  // the same screen, which is what keeps the pre-read frame from flashing.
  it('is amatista', () => {
    expect(DEFAULT_PALETTE).toBe('amatista')
  })

  it('is the first option offered', () => {
    expect(PALETTES[0]).toBe(DEFAULT_PALETTE)
  })
})

describe('setPaletteInputSchema', () => {
  it('parses a named palette', () => {
    expect(setPaletteInputSchema.parse({ palette: 'cobalto' })).toEqual({ palette: 'cobalto' })
  })

  it.each([
    ['an empty payload', {}],
    ['no payload at all', undefined],
    ['a palette outside the union', { palette: 'sepia' }],
    ['the theme payload shape', { preference: 'dark' }]
  ])('refuses %s', (_label, payload) => {
    expect(setPaletteInputSchema.safeParse(payload).success).toBe(false)
  })
})
