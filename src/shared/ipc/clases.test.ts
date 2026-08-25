import { describe, expect, it } from 'vitest'
import {
  classDayInputSchema,
  CLASS_NOTE_BODY_MAX_CHARS,
  saveClassNoteInputSchema,
  setAttendanceInputSchema
} from './clases'

// Validation messages are STABLE MACHINE KEYS, never prose — the renderer
// translates them at the render site. These tests assert the KEYS, so a
// rewording of the Spanish copy can never break the contract, and a rename of
// a key can never pass unnoticed.
function messages(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? []
}

describe('setAttendanceInputSchema', () => {
  it('accepts the three marks the domain admits', () => {
    for (const status of ['presente', 'ausente', 'feriado'] as const) {
      expect(setAttendanceInputSchema.safeParse({ subjectId: 1, date: '2026-08-14', status }).success).toBe(true)
    }
  })

  it('rejects a status outside the closed set', () => {
    const result = setAttendanceInputSchema.safeParse({ subjectId: 1, date: '2026-08-14', status: 'tarde' })

    expect(result.success).toBe(false)
  })

  it('rejects a missing date under the `date.required` key', () => {
    const result = setAttendanceInputSchema.safeParse({ subjectId: 1, status: 'presente' })

    expect(result.success).toBe(false)
    expect(messages(result)).toContain('date.required')
  })

  it('rejects a date that is not a calendar day', () => {
    const result = setAttendanceInputSchema.safeParse({ subjectId: 1, date: '14/08/2026', status: 'presente' })

    expect(result.success).toBe(false)
    expect(messages(result)).toContain('date.invalid')
  })

  // A datetime is the wrong precision on purpose: a class you attended is a
  // whole day, and the moment lives in the weekly slot, not in the mark.
  it('rejects a datetime', () => {
    const result = setAttendanceInputSchema.safeParse({ subjectId: 1, date: '2026-08-14T08:00', status: 'presente' })

    expect(result.success).toBe(false)
    expect(messages(result)).toContain('date.invalid')
  })

  it('rejects a non-positive subject id', () => {
    expect(setAttendanceInputSchema.safeParse({ subjectId: 0, date: '2026-08-14', status: 'presente' }).success).toBe(
      false
    )
  })
})

describe('classDayInputSchema', () => {
  // Clearing a mark and deleting an apunte address the SAME thing a mark and
  // an apunte are anchored by: one subject, one day.
  it('accepts a subject and a calendar day', () => {
    expect(classDayInputSchema.safeParse({ subjectId: 3, date: '2026-08-14' }).success).toBe(true)
  })

  it('rejects a missing date under the `date.required` key', () => {
    const result = classDayInputSchema.safeParse({ subjectId: 3 })

    expect(result.success).toBe(false)
    expect(messages(result)).toContain('date.required')
  })
})

describe('saveClassNoteInputSchema', () => {
  it('accepts a body and trims it', () => {
    const result = saveClassNoteInputSchema.safeParse({ subjectId: 1, date: '2026-08-14', body: '  Semáforos  ' })

    expect(result.success).toBe(true)
    expect(result.data?.body).toBe('Semáforos')
  })

  // An empty apunte is not a stored state: clearing one is a delete, which is
  // its own command.
  it('rejects an empty body', () => {
    const result = saveClassNoteInputSchema.safeParse({ subjectId: 1, date: '2026-08-14', body: '   ' })

    expect(result.success).toBe(false)
    expect(messages(result)).toContain('body.required')
  })

  // The same 20k cap `subjects.notas` carries — one plain-text field, bounded
  // against an unbounded write, not against real notes.
  it('accepts a body at the cap', () => {
    const result = saveClassNoteInputSchema.safeParse({
      subjectId: 1,
      date: '2026-08-14',
      body: 'a'.repeat(CLASS_NOTE_BODY_MAX_CHARS)
    })

    expect(result.success).toBe(true)
  })

  it('rejects an oversized body under the `body.tooLong` key', () => {
    const result = saveClassNoteInputSchema.safeParse({
      subjectId: 1,
      date: '2026-08-14',
      body: 'a'.repeat(CLASS_NOTE_BODY_MAX_CHARS + 1)
    })

    expect(result.success).toBe(false)
    expect(messages(result)).toContain('body.tooLong')
  })

  it('rejects a missing date under the `date.required` key', () => {
    const result = saveClassNoteInputSchema.safeParse({ subjectId: 1, body: 'Semáforos' })

    expect(result.success).toBe(false)
    expect(messages(result)).toContain('date.required')
  })
})
