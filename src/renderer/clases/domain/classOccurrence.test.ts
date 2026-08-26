import { describe, expect, it } from 'vitest'
import { findAttendanceStatus, findClassNote, resolveClassOccurrence, toLocalIsoDate } from './classOccurrence'

// 2026-08-14 is a Friday; 2026-08-13 a Thursday.
const thursdayMorning = { dayOfWeek: 4, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }
const thursdayEvening = { dayOfWeek: 4, startMinutes: 1110, endMinutes: 1290, location: 'Aula 301' }
const mondaySlot = { dayOfWeek: 1, startMinutes: 600, endMinutes: 720, location: 'Lab 3' }

describe('resolveClassOccurrence', () => {
  // The whole point of the `(subjectId, date)` anchor: nothing dated is
  // stored, so the concrete class is composed from the weekly pattern.
  it('finds the slot whose weekday the date falls on', () => {
    expect(resolveClassOccurrence([mondaySlot, thursdayMorning], '2026-08-13')).toEqual(thursdayMorning)
  })

  it('returns null when the pattern has no class that weekday', () => {
    expect(resolveClassOccurrence([mondaySlot], '2026-08-13')).toBeNull()
  })

  // A mark is anchored to the DAY, so two classes on the same weekday share
  // one mark; the earliest is the representative occurrence.
  it('answers with the day`s first class when the weekday has two', () => {
    expect(resolveClassOccurrence([thursdayEvening, thursdayMorning], '2026-08-13')).toEqual(thursdayMorning)
  })

  // A slot deleted from the horario cannot make the mark disappear — it only
  // makes the occurrence unresolvable, which callers render as "no time".
  it('returns null when the pattern no longer covers a date that was marked', () => {
    expect(resolveClassOccurrence([], '2026-08-13')).toBeNull()
  })

  it('returns null for a malformed date rather than guessing a weekday', () => {
    expect(resolveClassOccurrence([thursdayMorning], '13/08/2026')).toBeNull()
  })
})

describe('toLocalIsoDate', () => {
  // LOCAL, never UTC: `toISOString()` would shift the calendar day for a
  // late-night mark (design §3a "the DST rule"), silently filing a class
  // under tomorrow.
  it('formats a Date as the local calendar day', () => {
    expect(toLocalIsoDate(new Date(2026, 7, 14, 23, 30))).toBe('2026-08-14')
  })
})

describe('findAttendanceStatus', () => {
  const marks = [
    { id: 1, subjectId: 7, date: '2026-08-14', status: 'presente' as const },
    { id: 2, subjectId: 7, date: '2026-08-07', status: 'ausente' as const },
    { id: 3, subjectId: 9, date: '2026-08-14', status: 'feriado' as const }
  ]

  it('answers with the mark for that subject on that day', () => {
    expect(findAttendanceStatus(marks, 7, '2026-08-14')).toBe('presente')
  })

  // Unmarked is the ABSENCE of a row, never a fourth status.
  it('answers null for a class that was never marked', () => {
    expect(findAttendanceStatus(marks, 7, '2026-08-21')).toBeNull()
  })

  it('never crosses subjects', () => {
    expect(findAttendanceStatus(marks, 9, '2026-08-07')).toBeNull()
  })
})

describe('findClassNote', () => {
  const notes = [
    { id: 1, subjectId: 7, date: '2026-08-14', preview: 'Round robin.' },
    { id: 2, subjectId: 9, date: '2026-08-14', preview: 'Otra materia.' }
  ]

  it('answers with the apunte for that subject on that day', () => {
    expect(findClassNote(notes, 7, '2026-08-14')?.preview).toBe('Round robin.')
  })

  it('answers null when that class has no apunte', () => {
    expect(findClassNote(notes, 7, '2026-08-07')).toBeNull()
  })
})
