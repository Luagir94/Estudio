import { describe, expect, it } from 'vitest'
import {
  createPartialExamInputSchema,
  deletePartialExamResultSchema,
  partialExamIdInputSchema,
  updatePartialExamInputSchema
} from './parciales'

describe('createPartialExamInputSchema', () => {
  const valid = {
    subjectId: 7,
    label: '1er parcial',
    takenOn: '2026-05-12',
    result: 'aprobado' as const,
    grade: 8
  }

  it('parses a fully-specified payload', () => {
    expect(createPartialExamInputSchema.parse(valid)).toEqual(valid)
  })

  it('defaults result to pendiente when omitted', () => {
    const { result: _result, ...withoutResult } = valid
    expect(createPartialExamInputSchema.parse(withoutResult).result).toBe('pendiente')
  })

  it.each([
    ['empty string (cleared <input type="date">)', ''],
    ['undefined (field never sent)', undefined],
    ['explicit null', null]
  ])('normalizes a missing date to null — %s', (_case, takenOn) => {
    expect(createPartialExamInputSchema.parse({ ...valid, takenOn }).takenOn).toBeNull()
  })

  // "Aprobado sin nota" is a first-class state, not a missing field.
  it.each([
    ['empty string (cleared number input)', ''],
    ['undefined (field never sent)', undefined],
    ['explicit null', null]
  ])('normalizes a missing nota to null — %s', (_case, grade) => {
    expect(createPartialExamInputSchema.parse({ ...valid, grade }).grade).toBeNull()
  })

  it('coerces a numeric-string nota, same as materias:setOutcome', () => {
    expect(createPartialExamInputSchema.parse({ ...valid, grade: '7.5' }).grade).toBe(7.5)
  })

  it('trims the label', () => {
    expect(createPartialExamInputSchema.parse({ ...valid, label: '  Recuperatorio 1  ' }).label).toBe('Recuperatorio 1')
  })

  it.each([
    ['non-YYYY-MM-DD date', { ...valid, takenOn: '12/05/2026' }],
    ['datetime instead of a calendar date', { ...valid, takenOn: '2026-05-12T09:00' }],
    ['missing subjectId', { label: valid.label, takenOn: null }],
    ['zero subjectId', { ...valid, subjectId: 0 }],
    ['negative subjectId', { ...valid, subjectId: -1 }],
    ['non-integer subjectId', { ...valid, subjectId: 1.5 }],
    ['blank label', { ...valid, label: '   ' }],
    ['missing label', { subjectId: 7, takenOn: null }],
    ['label over 200 chars', { ...valid, label: 'x'.repeat(201) }],
    ['result outside the enum', { ...valid, result: 'ausente' }],
    ['non-numeric nota', { ...valid, grade: 'ocho' }],
    ['negative nota', { ...valid, grade: -1 }]
  ])('rejects %s', (_case, payload) => {
    expect(createPartialExamInputSchema.safeParse(payload).success).toBe(false)
  })

  // The renderer translates this key through the `validation` namespace — it
  // must stay a stable machine key, never prose.
  it('reports a negative nota with the grade.outOfRange machine key', () => {
    const parsed = createPartialExamInputSchema.safeParse({ ...valid, grade: -1 })

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((issue) => issue.message)).toContain('grade.outOfRange')
  })

  it('reports a blank label with the label.required machine key', () => {
    const parsed = createPartialExamInputSchema.safeParse({ ...valid, label: '  ' })

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((issue) => issue.message)).toContain('label.required')
  })

  it('accepts a label exactly at the 200-char cap', () => {
    const label = 'x'.repeat(200)
    expect(createPartialExamInputSchema.parse({ ...valid, label }).label).toBe(label)
  })
})

describe('updatePartialExamInputSchema', () => {
  const valid = {
    id: 3,
    label: 'Recuperatorio 1',
    takenOn: null,
    result: 'reprobado' as const
  }

  it('parses a valid payload — grade defaults to null when omitted', () => {
    expect(updatePartialExamInputSchema.parse(valid)).toEqual({ ...valid, grade: null })
  })

  it('normalizes a cleared date to null, same as create', () => {
    expect(updatePartialExamInputSchema.parse({ ...valid, takenOn: '' }).takenOn).toBeNull()
  })

  // Unlike a mesa de final, a parcial carries its nota on ANY result: a
  // reprobado 3 is exactly the number the cátedra wrote down.
  it('keeps a nota on a reprobado parcial', () => {
    expect(updatePartialExamInputSchema.parse({ ...valid, grade: 3 }).grade).toBe(3)
  })

  it.each([
    ['missing id', { label: valid.label, takenOn: null, result: valid.result }],
    ['zero id', { ...valid, id: 0 }],
    ['non-integer id', { ...valid, id: 1.5 }],
    ['missing result — required here, NOT defaulted like create', { id: 3, label: valid.label, takenOn: null }],
    ['result outside the enum', { ...valid, result: 'libre' }],
    ['blank label', { ...valid, label: '  ' }],
    ['non-numeric nota', { ...valid, grade: 'ocho' }],
    ['negative nota', { ...valid, grade: -2 }]
  ])('rejects %s', (_case, payload) => {
    expect(updatePartialExamInputSchema.safeParse(payload).success).toBe(false)
  })
})

describe('partialExamIdInputSchema', () => {
  it('parses a positive integer id', () => {
    expect(partialExamIdInputSchema.parse({ id: 3 })).toEqual({ id: 3 })
  })

  it.each([
    ['zero', { id: 0 }],
    ['negative', { id: -1 }],
    ['non-integer', { id: 1.5 }],
    ['string', { id: '3' }],
    ['missing', {}]
  ])('rejects an id that is %s', (_case, payload) => {
    expect(partialExamIdInputSchema.safeParse(payload).success).toBe(false)
  })
})

describe('deletePartialExamResultSchema', () => {
  it('parses the deleted id envelope', () => {
    expect(deletePartialExamResultSchema.parse({ id: 1 })).toEqual({ id: 1 })
  })

  it('rejects a payload without id', () => {
    expect(deletePartialExamResultSchema.safeParse({}).success).toBe(false)
  })
})
