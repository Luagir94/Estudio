import { describe, expect, it } from 'vitest'
import { calculateProgramAverage, createProgram, hasRecordedEvaluations, validateGrade } from './program'

const numericProgram = {
  name: 'Abogacía',
  institution: 'Universidad de Buenos Aires',
  color: '#4C8DFF',
  gradingScheme: 'numerico' as const,
  gradeScale: 10
}

const binaryProgram = {
  name: 'Curso de Bartender',
  institution: 'Escuela Gastronómica Norte',
  color: '#FB923C',
  gradingScheme: 'binario' as const,
  gradeScale: null
}

describe('createProgram', () => {
  it('accepts a numeric program with its scale', () => {
    const result = createProgram(numericProgram)

    expect(result).toEqual({ ok: true, program: numericProgram })
  })

  it('accepts a pass/fail program with no scale', () => {
    const result = createProgram(binaryProgram)

    expect(result.ok).toBe(true)
  })

  it('treats a missing scale on a pass/fail program as absent', () => {
    const { gradeScale, ...withoutScale } = binaryProgram
    void gradeScale

    const result = createProgram(withoutScale)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.program.gradeScale).toBeNull()
  })

  it('requires a scale when the scheme is numeric', () => {
    const result = createProgram({ ...numericProgram, gradeScale: null })

    expect(result).toEqual({
      ok: false,
      errors: [{ path: ['gradeScale'], message: 'gradeScale is required when gradingScheme is numerico' }]
    })
  })

  it('refuses a scale on a pass/fail program', () => {
    const result = createProgram({ ...binaryProgram, gradeScale: 10 })

    expect(result).toEqual({
      ok: false,
      errors: [{ path: ['gradeScale'], message: 'gradeScale must be absent when gradingScheme is binario' }]
    })
  })

  it('accepts a scale the institution actually uses, not just 1-10', () => {
    const result = createProgram({ ...numericProgram, gradeScale: 100 })

    expect(result.ok).toBe(true)
  })

  it('accepts a program with no institution', () => {
    const result = createProgram({ ...binaryProgram, institution: '' })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.program.institution).toBeNull()
  })

  it('rejects an unknown grading scheme', () => {
    const result = createProgram({ ...numericProgram, gradingScheme: 'estrellas' })

    expect(result.ok).toBe(false)
  })

  it('requires a name', () => {
    const result = createProgram({ ...numericProgram, name: '  ' })

    expect(result.ok).toBe(false)
  })
})

describe('validateGrade', () => {
  it('accepts a grade inside the program scale', () => {
    expect(validateGrade(numericProgram, 8)).toEqual({ ok: true })
  })

  it('accepts a grade on a wider scale', () => {
    expect(validateGrade({ gradingScheme: 'numerico', gradeScale: 100 }, 85)).toEqual({ ok: true })
  })

  it('accepts a not-yet-graded subject', () => {
    expect(validateGrade(numericProgram, null)).toEqual({ ok: true })
  })

  it('rejects a grade above the scale', () => {
    expect(validateGrade(numericProgram, 11)).toEqual({
      ok: false,
      error: 'grade must be between 0 and 10'
    })
  })

  it('rejects a negative grade', () => {
    expect(validateGrade(numericProgram, -1).ok).toBe(false)
  })

  it('rejects any grade on a pass/fail program', () => {
    expect(validateGrade(binaryProgram, 8)).toEqual({
      ok: false,
      error: 'a pass/fail program does not carry grades'
    })
  })

  it('accepts a null grade on a pass/fail program', () => {
    expect(validateGrade(binaryProgram, null)).toEqual({ ok: true })
  })
})

describe('calculateProgramAverage', () => {
  it('reports no average when nothing is graded yet', () => {
    expect(calculateProgramAverage([])).toEqual({
      withFailed: null,
      withoutFailed: null,
      gradedSubjects: 0,
      failedSubjects: 0
    })
  })

  it('ignores subjects that have no grade', () => {
    const average = calculateProgramAverage([
      { grade: 8, passed: true },
      { grade: null, passed: false }
    ])

    expect(average).toEqual({
      withFailed: 8,
      withoutFailed: 8,
      gradedSubjects: 1,
      failedSubjects: 0
    })
  })

  it('reports both averages, with and without the failed subjects', () => {
    const average = calculateProgramAverage([
      { grade: 8, passed: true },
      { grade: 6, passed: true },
      { grade: 2, passed: false },
      { grade: 10, passed: true }
    ])

    expect(average).toEqual({
      withFailed: 6.5,
      withoutFailed: 8,
      gradedSubjects: 4,
      failedSubjects: 1
    })
  })

  it('rounds to two decimals', () => {
    const average = calculateProgramAverage([
      { grade: 8, passed: true },
      { grade: 7, passed: true },
      { grade: 7, passed: true }
    ])

    expect(average.withFailed).toBe(7.33)
  })

  it('reports no passing average when every graded subject was failed', () => {
    const average = calculateProgramAverage([
      { grade: 2, passed: false },
      { grade: 3, passed: false }
    ])

    expect(average).toEqual({
      withFailed: 2.5,
      withoutFailed: null,
      gradedSubjects: 2,
      failedSubjects: 2
    })
  })
})

// The rule that decides whether a carrera's grading scheme is still
// changeable. It is a question about RECORDED WORK, not about how many
// subjects exist: a carrera full of untouched materias has nothing to lose.
describe('hasRecordedEvaluations', () => {
  it('reports nothing recorded for a carrera with no subjects at all', () => {
    expect(hasRecordedEvaluations([])).toBe(false)
  })

  it('reports nothing recorded while every subject is untouched', () => {
    expect(
      hasRecordedEvaluations([
        { grade: null, outcome: null, hasApprovedFinal: false },
        { grade: null, outcome: null, hasApprovedFinal: false }
      ])
    ).toBe(false)
  })

  it('counts a recorded grade', () => {
    expect(hasRecordedEvaluations([{ grade: 8, outcome: null, hasApprovedFinal: false }])).toBe(true)
  })

  // A `binario` program never records a NUMBER, so asking only about grades
  // would report it as untouched forever and let its scheme flip out from
  // under work already closed.
  it('counts a recorded outcome even with no grade — the binario case', () => {
    expect(hasRecordedEvaluations([{ grade: null, outcome: 'aprobada', hasApprovedFinal: false }])).toBe(true)
  })

  it('counts a passed final even with no grade and no outcome', () => {
    expect(hasRecordedEvaluations([{ grade: null, outcome: null, hasApprovedFinal: true }])).toBe(true)
  })

  it('counts one evaluated subject among many untouched ones', () => {
    expect(
      hasRecordedEvaluations([
        { grade: null, outcome: null, hasApprovedFinal: false },
        { grade: 4, outcome: 'reprobada', hasApprovedFinal: false },
        { grade: null, outcome: null, hasApprovedFinal: false }
      ])
    ).toBe(true)
  })
})
