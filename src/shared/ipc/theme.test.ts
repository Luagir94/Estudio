import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_PREFERENCE,
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
