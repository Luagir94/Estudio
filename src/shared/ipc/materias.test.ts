import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parsePayload, subjectRecordSchema, updateSubjectScheduleInputSchema } from './materias'

// Validation messages in the real schemas are stable machine keys, so the
// fixture mirrors that convention — the joined string below is pinned
// byte-for-byte because every IPC handler's VALIDATION_ERROR envelope is
// built from it.
const schema = z.object({
  id: z.number().int().positive('id.positive'),
  name: z.string().min(1, 'name.required')
})

describe('parsePayload', () => {
  it('returns the parsed data on success', () => {
    const result = parsePayload(schema, { id: 7, name: 'Mesa' })

    expect(result).toEqual({ ok: true, data: { id: 7, name: 'Mesa' } })
  })

  it('applies schema transforms — the handler must receive the PARSED payload, not the raw one', () => {
    const defaulting = z.object({ mode: z.string().default('auto') })

    const result = parsePayload(defaulting, {})

    expect(result).toEqual({ ok: true, data: { mode: 'auto' } })
  })

  it('maps a failure to the exact VALIDATION_ERROR envelope the handlers return today', () => {
    const result = parsePayload(schema, { id: -1, name: '' })

    expect(result).toEqual({
      ok: false,
      failure: {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'id.positive; name.required' }
      }
    })
  })

  it('joins a single issue without a trailing separator', () => {
    const result = parsePayload(schema, { id: 7, name: '' })

    expect(result).toEqual({
      ok: false,
      failure: { ok: false, error: { code: 'VALIDATION_ERROR', message: 'name.required' } }
    })
  })

  it('accepts an explicit error code for the failure envelope', () => {
    const result = parsePayload(schema, { id: -1, name: 'Mesa' }, 'CUSTOM_CODE')

    expect(result).toEqual({
      ok: false,
      failure: { ok: false, error: { code: 'CUSTOM_CODE', message: 'id.positive' } }
    })
  })
})

// Ficha de cátedra: comision/aula/groupUrl mirror docente/contacto/campusUrl
// exactly — same optionalTextField (trim, empty-string-as-not-provided,
// 2000-char cap), edit-form-only, and for groupUrl the same open-time
// https-only control in main (app/campusUrlValidator.ts) instead of a
// schema-level URL check.
describe('updateSubjectScheduleInputSchema — ficha de cátedra fields', () => {
  const baseUpdate = {
    id: 1,
    name: 'Algoritmos',
    code: 'ALG-101',
    color: '#7c3aed',
    slots: [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: null }]
  }

  it('round-trips comision, aula and groupUrl, trimming like docente/contacto', () => {
    const result = updateSubjectScheduleInputSchema.safeParse({
      ...baseUpdate,
      comision: '  K2051  ',
      aula: 'Lab 3 · Edificio B',
      groupUrl: 'https://chat.whatsapp.com/AbC123'
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected validation success')
    expect(result.data.comision).toBe('K2051')
    expect(result.data.aula).toBe('Lab 3 · Edificio B')
    expect(result.data.groupUrl).toBe('https://chat.whatsapp.com/AbC123')
  })

  it('treats an empty string as not provided — HTML inputs emit "" when left blank', () => {
    const result = updateSubjectScheduleInputSchema.safeParse({
      ...baseUpdate,
      comision: '',
      aula: '',
      groupUrl: ''
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected validation success')
    expect(result.data.comision).toBeUndefined()
    expect(result.data.aula).toBeUndefined()
    expect(result.data.groupUrl).toBeUndefined()
  })

  it.each(['comision', 'aula', 'groupUrl'])('rejects a %s above the 2000-char cap', (field) => {
    const result = updateSubjectScheduleInputSchema.safeParse({ ...baseUpdate, [field]: 'x'.repeat(2001) })

    expect(result.success).toBe(false)
  })

  // Parity pin: campusUrl carries NO schema-level URL validation (the
  // enforced control is main's https-only allowlist at open time), so
  // groupUrl must not sprout one either — if either side changes, this test
  // flags the divergence.
  it('accepts a groupUrl that is not a well-formed URL, exactly like campusUrl', () => {
    const result = updateSubjectScheduleInputSchema.safeParse({
      ...baseUpdate,
      campusUrl: 'not a url',
      groupUrl: 'not a url'
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected validation success')
    expect(result.data.groupUrl).toBe(result.data.campusUrl)
  })
})

describe('subjectRecordSchema — ficha de cátedra fields', () => {
  const baseRecord = {
    id: 1,
    name: 'Algoritmos',
    code: 'ALG-101',
    color: '#7c3aed',
    docente: null,
    contacto: null,
    campusUrl: null,
    notas: null,
    attendanceMinPercent: null,
    periodId: null,
    outcome: null,
    grade: null
  }

  it('carries comision, aula and groupUrl as nullable strings, same shape as campusUrl', () => {
    const result = subjectRecordSchema.safeParse({
      ...baseRecord,
      comision: 'K2051',
      aula: 'Lab 3 · Edificio B',
      groupUrl: 'https://chat.whatsapp.com/AbC123'
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected validation success')
    expect(result.data.comision).toBe('K2051')
    expect(result.data.aula).toBe('Lab 3 · Edificio B')
    expect(result.data.groupUrl).toBe('https://chat.whatsapp.com/AbC123')
  })

  it('accepts null for all three — a subject without a ficha is a normal subject', () => {
    const result = subjectRecordSchema.safeParse({ ...baseRecord, comision: null, aula: null, groupUrl: null })

    expect(result.success).toBe(true)
  })
})
