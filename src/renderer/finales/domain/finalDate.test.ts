import { describe, expect, it } from 'vitest'
import { formatTakenOn } from './finalDate'

// Runs against the REAL i18next instance (bootstrapped by vitest.setup.ts,
// same as translateValidationMessage.test.ts): the month table under test IS
// `common:monthsShort`, so stubbing it would test the stub.
describe('formatTakenOn', () => {
  it('reads "DD mes YYYY" — lowercase month, zero-padded day, year always shown', () => {
    expect(formatTakenOn('2026-08-18')).toBe('18 ago 2026')
  })

  it('keeps the zero padding the stored date already carries', () => {
    expect(formatTakenOn('2026-03-05')).toBe('05 mar 2026')
  })

  it('resolves the first and last catalog months (index arithmetic bounds)', () => {
    expect(formatTakenOn('2024-01-01')).toBe('01 ene 2024')
    expect(formatTakenOn('2024-12-31')).toBe('31 dic 2024')
  })

  describe('malformed input falls back to the raw string — never interpolates "undefined"', () => {
    it.each([
      ['not a dashed date at all', 'agosto 18, 2026'],
      ['non-numeric month segment', 'not-a-date'],
      ['month above the catalog (13)', '2026-13-01'],
      ['month zero (index -1)', '2026-00-10'],
      ['missing day segment', '2026-08'],
      ['empty string', ''],
      ['empty segments', '--']
    ])('%s: returns the input unchanged', (_case, input) => {
      expect(formatTakenOn(input)).toBe(input)
    })
  })
})
