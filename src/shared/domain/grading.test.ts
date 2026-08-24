import { describe, expect, it } from 'vitest'
import { validateGrade, type GradingRules } from './grading'

// Cross-process invariant: this exact function is called by BOTH
// `main/materias/adapters/sqliteSubjectRepository.ts` (write boundary) and
// `renderer/materias/components/CerrarMateriaModal.tsx` (form validation).
// These tests pin the rule both sides share.
describe('validateGrade', () => {
  const numerico10: GradingRules = { gradingScheme: 'numerico', gradeScale: 10 }
  const numerico100: GradingRules = { gradingScheme: 'numerico', gradeScale: 100 }
  const binario: GradingRules = { gradingScheme: 'binario', gradeScale: null }

  describe('null grade — "not graded yet" is legal under every scheme', () => {
    it('is valid under numerico', () => {
      expect(validateGrade(numerico10, null)).toEqual({ ok: true })
    })

    it('is valid under binario — and is the only valid state there', () => {
      expect(validateGrade(binario, null)).toEqual({ ok: true })
    })
  })

  describe('binario scheme — no numeric grade is ever admissible', () => {
    it.each([0, 4, 10])('rejects grade %d', (grade) => {
      expect(validateGrade(binario, grade)).toEqual({
        ok: false,
        error: 'a pass/fail program does not carry grades'
      })
    })
  })

  describe('numerico scheme — inclusive 0..gradeScale range', () => {
    it('accepts both boundaries of a 0-10 scale', () => {
      expect(validateGrade(numerico10, 0)).toEqual({ ok: true })
      expect(validateGrade(numerico10, 10)).toEqual({ ok: true })
    })

    it('accepts an interior value, integer or not', () => {
      expect(validateGrade(numerico10, 7)).toEqual({ ok: true })
      expect(validateGrade(numerico10, 7.5)).toEqual({ ok: true })
    })

    it('rejects a grade just above the top of the scale', () => {
      expect(validateGrade(numerico10, 10.5)).toEqual({
        ok: false,
        error: 'grade must be between 0 and 10'
      })
    })

    it('rejects a negative grade', () => {
      expect(validateGrade(numerico10, -1)).toEqual({
        ok: false,
        error: 'grade must be between 0 and 10'
      })
    })

    it('reads the top from the program, not a constant — a 0-100 scale admits 100', () => {
      expect(validateGrade(numerico100, 100)).toEqual({ ok: true })
      expect(validateGrade(numerico100, 101)).toEqual({
        ok: false,
        error: 'grade must be between 0 and 100'
      })
    })

    it('names the actual top of the scale in the error message', () => {
      const result = validateGrade(numerico100, 101)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('100')
    })
  })

  describe('numerico with a null gradeScale — the ?? 0 fallback collapses the range to {0}', () => {
    const numericoNullScale: GradingRules = { gradingScheme: 'numerico', gradeScale: null }

    it('still accepts null and the lone in-range value 0', () => {
      expect(validateGrade(numericoNullScale, null)).toEqual({ ok: true })
      expect(validateGrade(numericoNullScale, 0)).toEqual({ ok: true })
    })

    it('rejects everything else', () => {
      expect(validateGrade(numericoNullScale, 1)).toEqual({
        ok: false,
        error: 'grade must be between 0 and 0'
      })
      expect(validateGrade(numericoNullScale, -1)).toEqual({
        ok: false,
        error: 'grade must be between 0 and 0'
      })
    })
  })
})
