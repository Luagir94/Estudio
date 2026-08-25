import { describe, expect, it } from 'vitest'
import {
  createFinalExamInputSchema,
  deleteFinalExamResultSchema,
  finalExamIdInputSchema,
  updateFinalExamInputSchema
} from './finales'

describe('createFinalExamInputSchema', () => {
  const valid = {
    subjectId: 7,
    label: 'Mesa de agosto',
    takenOn: '2026-08-10',
    result: 'aprobado' as const
  }

  it('parses a fully-specified payload', () => {
    expect(createFinalExamInputSchema.parse(valid)).toEqual(valid)
  })

  it('defaults result to pendiente when omitted', () => {
    const { result: _result, ...withoutResult } = valid
    expect(createFinalExamInputSchema.parse(withoutResult).result).toBe('pendiente')
  })

  it.each([
    ['empty string (cleared <input type="date">)', ''],
    ['undefined (field never sent)', undefined],
    ['explicit null', null]
  ])('normalizes a missing date to null — %s', (_case, takenOn) => {
    expect(createFinalExamInputSchema.parse({ ...valid, takenOn }).takenOn).toBeNull()
  })

  it('trims the label', () => {
    expect(createFinalExamInputSchema.parse({ ...valid, label: '  Mesa  ' }).label).toBe('Mesa')
  })

  it.each([
    ['non-YYYY-MM-DD date', { ...valid, takenOn: '10/08/2026' }],
    ['datetime instead of a calendar date', { ...valid, takenOn: '2026-08-10T09:00' }],
    ['missing subjectId', { label: valid.label, takenOn: null }],
    ['zero subjectId', { ...valid, subjectId: 0 }],
    ['negative subjectId', { ...valid, subjectId: -1 }],
    ['non-integer subjectId', { ...valid, subjectId: 1.5 }],
    ['blank label', { ...valid, label: '   ' }],
    ['label over 200 chars', { ...valid, label: 'x'.repeat(201) }],
    ['result outside the enum', { ...valid, result: 'ausente' }]
  ])('rejects %s', (_case, payload) => {
    expect(createFinalExamInputSchema.safeParse(payload).success).toBe(false)
  })

  it('accepts a label exactly at the 200-char cap', () => {
    const label = 'x'.repeat(200)
    expect(createFinalExamInputSchema.parse({ ...valid, label }).label).toBe(label)
  })
})

describe('updateFinalExamInputSchema', () => {
  const valid = {
    id: 3,
    label: 'Mesa de diciembre',
    takenOn: null,
    result: 'reprobado' as const
  }

  it('parses a valid payload — grade defaults to null when omitted', () => {
    expect(updateFinalExamInputSchema.parse(valid)).toEqual({ ...valid, grade: null })
  })

  it('normalizes a cleared date to null, same as create', () => {
    expect(updateFinalExamInputSchema.parse({ ...valid, takenOn: '' }).takenOn).toBeNull()
  })

  it('keeps the nota riding along with an approval', () => {
    expect(updateFinalExamInputSchema.parse({ ...valid, result: 'aprobado', grade: 8 }).grade).toBe(8)
  })

  it.each([
    ['empty string (cleared number input)', ''],
    ['undefined (field never sent)', undefined],
    ['explicit null', null]
  ])('normalizes a missing nota to null — %s', (_case, grade) => {
    expect(updateFinalExamInputSchema.parse({ ...valid, grade }).grade).toBeNull()
  })

  it('coerces a numeric-string nota, same as materias:setOutcome', () => {
    expect(updateFinalExamInputSchema.parse({ ...valid, result: 'aprobado', grade: '7.5' }).grade).toBe(7.5)
  })

  it.each([
    ['missing id', { label: valid.label, takenOn: null, result: valid.result }],
    ['zero id', { ...valid, id: 0 }],
    ['non-integer id', { ...valid, id: 1.5 }],
    ['missing result — required here, NOT defaulted like create', { id: 3, label: valid.label, takenOn: null }],
    ['result outside the enum', { ...valid, result: 'libre' }],
    ['blank label', { ...valid, label: '  ' }],
    ['non-numeric nota', { ...valid, grade: 'ocho' }]
  ])('rejects %s', (_case, payload) => {
    expect(updateFinalExamInputSchema.safeParse(payload).success).toBe(false)
  })
})

describe('finalExamIdInputSchema', () => {
  it('parses a positive integer id', () => {
    expect(finalExamIdInputSchema.parse({ id: 3 })).toEqual({ id: 3 })
  })

  it.each([
    ['zero', { id: 0 }],
    ['negative', { id: -1 }],
    ['non-integer', { id: 1.5 }],
    ['string', { id: '3' }],
    ['missing', {}]
  ])('rejects an id that is %s', (_case, payload) => {
    expect(finalExamIdInputSchema.safeParse(payload).success).toBe(false)
  })
})

describe('deleteFinalExamResultSchema', () => {
  it('parses the deleted id envelope', () => {
    expect(deleteFinalExamResultSchema.parse({ id: 1 })).toEqual({ id: 1 })
  })

  it('rejects a payload without id', () => {
    expect(deleteFinalExamResultSchema.safeParse({}).success).toBe(false)
  })
})
