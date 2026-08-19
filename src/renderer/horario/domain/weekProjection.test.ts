import { beforeAll, describe, expect, it } from 'vitest'
import { getWeekOccurrenceDate, projectWeek, type WeekProjectionSubject } from './weekProjection'

// Pins the process timezone deterministically for the DST-transition test
// below, matching the pattern established in subjectDetail.test.ts.
beforeAll(() => {
  process.env.TZ = 'America/New_York'
})

describe('projectWeek (task 4.1: group/order slots by dayOfWeek, Monday-start)', () => {
  it('always returns 7 columns, Monday-first, even when a day has no slots', () => {
    const columns = projectWeek([])

    expect(columns).toHaveLength(7)
    expect(columns.map((column) => column.mondayFirstIndex)).toEqual([0, 1, 2, 3, 4, 5, 6])
    // Table-driven per the gate finding: dayOfWeek is stored Sunday-based
    // (0=Sunday..6=Saturday), so Monday-first index 0 must map back to
    // stored dayOfWeek 1, and index 6 (Sunday) must map back to 0 — the
    // exact special case the gate finding flagged.
    expect(columns.map((column) => column.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it('groups each slot into its Monday-first column, reusing toMondayFirstIndex (not re-derived locally)', () => {
    const subjects: WeekProjectionSubject[] = [
      {
        id: 1,
        name: 'Sistemas Operativos',
        color: '#4c8dff',
        slots: [
          { id: 10, dayOfWeek: 1, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }, // Monday
          { id: 11, dayOfWeek: 0, startMinutes: 600, endMinutes: 660, location: null } // Sunday
        ]
      }
    ]

    const columns = projectWeek(subjects)

    const monday = columns[0]
    expect(monday.dayOfWeek).toBe(1)
    expect(monday.slots).toEqual([
      expect.objectContaining({ slotId: 10, subjectName: 'Sistemas Operativos', startMinutes: 480 })
    ])

    // Sunday must land LAST (index 6), not first — this is precisely the
    // off-by-one class of bug gate-findings/slice-2a Finding 2 warned about.
    const sunday = columns[6]
    expect(sunday.dayOfWeek).toBe(0)
    expect(sunday.slots).toEqual([expect.objectContaining({ slotId: 11, startMinutes: 600 })])
  })

  it('orders multiple slots within the same day ascending by startMinutes', () => {
    const subjects: WeekProjectionSubject[] = [
      {
        id: 1,
        name: 'Bases de Datos',
        color: '#2dd4a7',
        slots: [{ id: 20, dayOfWeek: 3, startMinutes: 900, endMinutes: 960, location: null }]
      },
      {
        id: 2,
        name: 'Redes de Computadoras',
        color: '#fb923c',
        slots: [{ id: 21, dayOfWeek: 3, startMinutes: 480, endMinutes: 540, location: null }]
      }
    ]

    const columns = projectWeek(subjects)
    const wednesday = columns[2]

    expect(wednesday.slots.map((slot) => slot.slotId)).toEqual([21, 20])
  })
})

describe('getWeekOccurrenceDate (task 4.2: DST-transition week test for occurrence rendering)', () => {
  it('composes the correct local date/time for a mid-week slot from a Monday anchor', () => {
    const weekStart = new Date('2026-03-02T00:00:00') // a Monday
    const occurrence = getWeekOccurrenceDate(weekStart, 3, 600) // Wednesday, 10:00

    expect(occurrence.getFullYear()).toBe(2026)
    expect(occurrence.getMonth()).toBe(2) // March (0-indexed)
    expect(occurrence.getDate()).toBe(4)
    expect(occurrence.getHours()).toBe(10)
    expect(occurrence.getMinutes()).toBe(0)
  })

  // America/New_York springs forward on 2026-03-08 (02:00 -> 03:00). The
  // week of Monday 2026-03-02..Sunday 2026-03-08 crosses that transition.
  // A slot stored for Sunday (dayOfWeek=0) at 10:00 must still render at
  // 10:00 local wall-clock on the far side of the jump — proving the
  // occurrence is composed from a local calendar date + minutes
  // (date-fns addDays/set), never by adding a fixed 24h/ms multiple or a
  // UTC offset to an instant.
  it('renders a Sunday slot at the same wall-clock time on the DST-transition day itself', () => {
    const weekStart = new Date('2026-03-02T00:00:00') // Monday, before the jump
    const occurrence = getWeekOccurrenceDate(weekStart, 0, 600) // Sunday 2026-03-08, 10:00

    expect(occurrence.getFullYear()).toBe(2026)
    expect(occurrence.getMonth()).toBe(2)
    expect(occurrence.getDate()).toBe(8)
    expect(occurrence.getHours()).toBe(10)
    expect(occurrence.getMinutes()).toBe(0)
  })

  it('renders a Monday slot the week AFTER the DST jump at the same wall-clock time', () => {
    const weekStart = new Date('2026-03-09T00:00:00') // Monday, the week after the jump
    const occurrence = getWeekOccurrenceDate(weekStart, 1, 600) // Monday 2026-03-09, 10:00

    expect(occurrence.getDate()).toBe(9)
    expect(occurrence.getHours()).toBe(10)
    expect(occurrence.getMinutes()).toBe(0)
  })
})
