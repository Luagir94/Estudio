import { describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { formatPartialGrade, partialExamBadgeLabel } from './partialExamBadge'

// The real catalog, not a stub: the whole point of this function is the
// SHAPE of the composed label, and a stub translator would let a broken
// interpolation pass.
const translate = (key: string, options?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'parciales', ...options })

describe('partialExamBadgeLabel', () => {
  // The approved design puts the nota INSIDE the result badge — there is no
  // separate nota column on a parcial row.
  it('carries the nota inside the badge label', () => {
    expect(partialExamBadgeLabel(translate, { result: 'aprobado', grade: 8 })).toBe('Aprobado · 8')
  })

  it('reads as the bare result when there is no nota', () => {
    expect(partialExamBadgeLabel(translate, { result: 'aprobado', grade: null })).toBe('Aprobado')
  })

  // A nota is not approved-only here: the number the cátedra wrote down on a
  // failed parcial is real data.
  it('carries the nota of a reprobado parcial too', () => {
    expect(partialExamBadgeLabel(translate, { result: 'reprobado', grade: 3 })).toBe('Reprobado · 3')
  })

  it('reads as the bare result on a pendiente parcial', () => {
    expect(partialExamBadgeLabel(translate, { result: 'pendiente', grade: null })).toBe('Pendiente')
  })

  // A zero is a nota, not a missing one — `null` is the only absence.
  it('shows a nota of 0', () => {
    expect(partialExamBadgeLabel(translate, { result: 'reprobado', grade: 0 })).toBe('Reprobado · 0')
  })
})

describe('formatPartialGrade', () => {
  // Same voice as the finales chip: a nota is quoted "7,5", never "7.5".
  it('quotes a decimal nota with the Argentine comma', () => {
    expect(formatPartialGrade(7.5)).toBe('7,5')
  })

  it('leaves a whole nota without decimals', () => {
    expect(formatPartialGrade(8)).toBe('8')
  })
})
