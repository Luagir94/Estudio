import { describe, expect, it } from 'vitest'
import { SUBJECT_ORIGINS, isSubjectOrigin } from './subjectOrigin'

describe('isSubjectOrigin', () => {
  it.each(SUBJECT_ORIGINS)('accepts %s', (origin) => {
    expect(isSubjectOrigin(origin)).toBe(true)
  })

  it('rejects an unrecognised value', () => {
    expect(isSubjectOrigin('inventado')).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isSubjectOrigin(undefined)).toBe(false)
  })
})
