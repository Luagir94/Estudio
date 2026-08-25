import { describe, expect, it } from 'vitest'
import {
  academicDateIdInputSchema,
  academicDateRecordSchema,
  academicDateWithProgramSchema,
  createAcademicDateInputSchema,
  deleteAcademicDateResultSchema,
  listAcademicDatesResultSchema,
  updateAcademicDateInputSchema
} from './fechas'

describe('createAcademicDateInputSchema', () => {
  const valid = {
    programId: 1,
    title: 'Inscripción a finales — Diciembre',
    kind: 'inscripcionFinales' as const,
    startsOn: '2026-12-01',
    endsOn: '2026-12-05'
  }

  it('parses a fully-specified window', () => {
    expect(createAcademicDateInputSchema.parse(valid)).toEqual(valid)
  })

  it.each([
    ['empty string (cleared <input type="date">)', ''],
    ['undefined (field never sent)', undefined],
    ['explicit null', null]
  ])('normalizes a missing endsOn to null — a single-day date — %s', (_case, endsOn) => {
    expect(createAcademicDateInputSchema.parse({ ...valid, endsOn }).endsOn).toBeNull()
  })

  it('trims the title', () => {
    expect(createAcademicDateInputSchema.parse({ ...valid, title: '  Vencimiento  ' }).title).toBe('Vencimiento')
  })

  it('accepts a one-day window whose endsOn equals startsOn', () => {
    expect(createAcademicDateInputSchema.safeParse({ ...valid, endsOn: valid.startsOn }).success).toBe(true)
  })

  it.each([['inscripcionFinales'], ['inscripcionCursadas'], ['vencimientoRegularidad'], ['otro']])(
    'accepts the %s kind',
    (kind) => {
      expect(createAcademicDateInputSchema.safeParse({ ...valid, kind }).success).toBe(true)
    }
  )

  it.each([
    ['a kind outside the closed set', { ...valid, kind: 'mudanza' }],
    ['a missing kind', { programId: 1, title: 'X', startsOn: '2026-12-01', endsOn: null }],
    ['a missing title', { programId: 1, kind: 'otro', startsOn: '2026-12-01', endsOn: null }],
    ['a blank title', { ...valid, title: '   ' }],
    ['a title over 200 chars', { ...valid, title: 'x'.repeat(201) }],
    ['a non-YYYY-MM-DD startsOn', { ...valid, startsOn: '01/12/2026' }],
    ['a datetime instead of a calendar date', { ...valid, startsOn: '2026-12-01T09:00' }],
    ['a missing programId', { title: 'X', kind: 'otro', startsOn: '2026-12-01', endsOn: null }],
    ['a zero programId', { ...valid, programId: 0 }],
    ['a non-integer programId', { ...valid, programId: 1.5 }]
  ])('rejects %s', (_case, payload) => {
    expect(createAcademicDateInputSchema.safeParse(payload).success).toBe(false)
  })

  it('rejects an endsOn before startsOn under the stable machine key', () => {
    const parsed = createAcademicDateInputSchema.safeParse({ ...valid, endsOn: '2026-11-30' })

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((issue) => issue.message)).toContain('endsOn.beforeStart')
  })

  it('reports a missing title under its own stable machine key', () => {
    const parsed = createAcademicDateInputSchema.safeParse({ ...valid, title: '' })

    expect(parsed.error?.issues.map((issue) => issue.message)).toContain('title.required')
  })
})

describe('updateAcademicDateInputSchema', () => {
  const valid = {
    id: 4,
    title: 'Vencimiento de regularidad',
    kind: 'vencimientoRegularidad' as const,
    startsOn: '2026-12-20',
    endsOn: null
  }

  it('parses a valid single-day payload', () => {
    expect(updateAcademicDateInputSchema.parse(valid)).toEqual(valid)
  })

  // A date never changes carrera: the same rule `updatePeriodInputSchema`
  // follows, so `programId` is not part of this command at all.
  it('does not carry a programId', () => {
    expect(updateAcademicDateInputSchema.parse({ ...valid, programId: 99 })).not.toHaveProperty('programId')
  })

  it('applies the same window rule as create', () => {
    const parsed = updateAcademicDateInputSchema.safeParse({ ...valid, startsOn: '2026-12-20', endsOn: '2026-12-19' })

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((issue) => issue.message)).toContain('endsOn.beforeStart')
  })

  it.each([
    ['missing id', { title: 'X', kind: 'otro', startsOn: '2026-12-01', endsOn: null }],
    ['zero id', { ...valid, id: 0 }],
    ['non-integer id', { ...valid, id: 1.5 }],
    ['kind outside the closed set', { ...valid, kind: 'tramite' }]
  ])('rejects %s', (_case, payload) => {
    expect(updateAcademicDateInputSchema.safeParse(payload).success).toBe(false)
  })
})

describe('academicDateIdInputSchema', () => {
  it('parses a positive integer id', () => {
    expect(academicDateIdInputSchema.parse({ id: 3 })).toEqual({ id: 3 })
  })

  it.each([
    ['zero', { id: 0 }],
    ['negative', { id: -1 }],
    ['non-integer', { id: 1.5 }],
    ['string', { id: '3' }],
    ['missing', {}]
  ])('rejects an id that is %s', (_case, payload) => {
    expect(academicDateIdInputSchema.safeParse(payload).success).toBe(false)
  })
})

describe('deleteAcademicDateResultSchema', () => {
  it('parses the deleted id envelope', () => {
    expect(deleteAcademicDateResultSchema.parse({ id: 1 })).toEqual({ id: 1 })
  })

  it('rejects a payload without id', () => {
    expect(deleteAcademicDateResultSchema.safeParse({}).success).toBe(false)
  })
})

describe('academicDateRecordSchema', () => {
  const record = {
    id: 1,
    programId: 2,
    title: 'Inscripción a finales',
    kind: 'inscripcionFinales' as const,
    startsOn: '2026-12-01',
    endsOn: '2026-12-05'
  }

  it('parses a stored window', () => {
    expect(academicDateRecordSchema.parse(record)).toEqual(record)
  })

  it('parses a stored single-day date', () => {
    expect(academicDateRecordSchema.parse({ ...record, endsOn: null }).endsOn).toBeNull()
  })

  // The table is new — every row was written through the write schemas above,
  // so the read side keeps the closed set too (same rule as
  // `finalExamRecordSchema.result`, unlike `periodRecordSchema.kind`, which
  // stays free text only because pre-catalogue rows exist).
  it('rejects a kind outside the closed set', () => {
    expect(academicDateRecordSchema.safeParse({ ...record, kind: 'mudanza' }).success).toBe(false)
  })

  it('carries the joined program name in the list shape', () => {
    const withProgram = { ...record, programName: 'Abogacía' }

    expect(academicDateWithProgramSchema.parse(withProgram)).toEqual(withProgram)
    expect(listAcademicDatesResultSchema.parse([withProgram])).toHaveLength(1)
  })

  it('rejects a list row missing its program name', () => {
    expect(listAcademicDatesResultSchema.safeParse([record]).success).toBe(false)
  })
})
