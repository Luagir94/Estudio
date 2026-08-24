import { describe, expect, it } from 'vitest'
import { subjectColorForScheme } from './subjectColorScheme'

// The eight catalogued dark hexes and their AA-verified light counterparts,
// exactly as the design records them (design/course-companion, light palette).
const PAIRS: readonly [dark: string, light: string][] = [
  ['#4C8DFF', '#2563EB'],
  ['#22D3EE', '#0891B2'],
  ['#FB923C', '#EA580C'],
  ['#A3E635', '#65A30D'],
  ['#F472B6', '#DB2777'],
  ['#E879F9', '#C026D3'],
  ['#34D399', '#059669'],
  ['#FACC15', '#CA8A04']
]

describe('subjectColorForScheme', () => {
  it('returns every value untouched for the dark scheme', () => {
    for (const [dark] of PAIRS) {
      expect(subjectColorForScheme(dark, 'dark')).toBe(dark)
    }
    expect(subjectColorForScheme('#123456', 'dark')).toBe('#123456')
  })

  it('maps each catalogued dark hex to its light counterpart', () => {
    for (const [dark, light] of PAIRS) {
      expect(subjectColorForScheme(dark, 'light')).toBe(light)
    }
  })

  // Stored rows are not case-normalized: the picker writes uppercase, older
  // seeds and fixtures are lowercase. Both are the same colour to CSS, so
  // both have to be the same colour to this mapping.
  it('matches the catalogue case-insensitively', () => {
    for (const [dark, light] of PAIRS) {
      expect(subjectColorForScheme(dark.toLowerCase(), 'light')).toBe(light)
    }
  })

  // A custom colour the user typed is theirs — the mapping only owns the
  // eight catalogued hues and must never repaint anything else.
  it('passes unknown values through unchanged in the light scheme', () => {
    expect(subjectColorForScheme('#123456', 'light')).toBe('#123456')
    expect(subjectColorForScheme('', 'light')).toBe('')
  })
})
