import { beforeAll, describe, expect, it } from 'vitest'
import {
  computeProgreso,
  computeWeeklyMinutes,
  getNextClassOccurrence,
  type SubjectDetailDeadline,
  type SubjectDetailSlot
} from './subjectDetail'

// This whole file exercises real wall-clock local-time arithmetic (design
// §3a "the DST rule"), so pin the process timezone deterministically instead
// of depending on whatever zone the CI/dev machine happens to be in.
beforeAll(() => {
  process.env.TZ = 'America/New_York'
})

/**
 * Local calendar-date formatter for assertions. `toISOString()` converts to
 * UTC first, which silently shifts the calendar day for any local time
 * within the UTC offset of midnight (e.g. 23:00 EST is already the next day
 * in UTC) — exactly the class of bug this DST-safety feature exists to
 * avoid, so the test must not reintroduce it via UTC-based assertions.
 */
function localDateString(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

describe('computeProgreso', () => {
  it('counts done vs total deadlines (spec: "Progreso reflects deadline completion ratio")', () => {
    const deadlines: SubjectDetailDeadline[] = [{ done: true }, { done: false }, { done: false }, { done: false }]

    expect(computeProgreso(deadlines)).toEqual({ done: 1, total: 4 })
  })

  it('reports 0/0 for a subject with no deadlines', () => {
    expect(computeProgreso([])).toEqual({ done: 0, total: 0 })
  })
})

describe('computeWeeklyMinutes', () => {
  it('sums endMinutes-startMinutes across every slot (pure integer math over stored minutes)', () => {
    const slots: SubjectDetailSlot[] = [
      { dayOfWeek: 1, startMinutes: 600, endMinutes: 660 }, // 60
      { dayOfWeek: 3, startMinutes: 480, endMinutes: 570 } // 90
    ]

    expect(computeWeeklyMinutes(slots)).toBe(150)
  })

  it('returns 0 for a subject with no slots', () => {
    expect(computeWeeklyMinutes([])).toBe(0)
  })
})

describe('getNextClassOccurrence', () => {
  it('returns null when the subject has no slots', () => {
    expect(getNextClassOccurrence([], new Date('2026-03-04T09:00:00'))).toBeNull()
  })

  it('picks the nearest future slot, not the first one in the list (spec: Tuesday/Friday, today Wednesday -> Friday)', () => {
    // 2026-03-04 is a Wednesday.
    const now = new Date('2026-03-04T09:00:00')
    const slots: SubjectDetailSlot[] = [
      { dayOfWeek: 2, startMinutes: 600, endMinutes: 660 }, // Tuesday 10:00 (already passed this week)
      { dayOfWeek: 5, startMinutes: 540, endMinutes: 600 } // Friday 09:00
    ]

    const next = getNextClassOccurrence(slots, now)

    expect(next).not.toBeNull()
    expect(next?.getDay()).toBe(5) // Friday
    expect(next && localDateString(next)).toBe('2026-03-06')
    expect(next?.getHours()).toBe(9)
    expect(next?.getMinutes()).toBe(0)
  })

  it('rolls over to next week when today IS the slot day but its start time already passed', () => {
    // 2026-03-04 is a Wednesday, 14:00 local.
    const now = new Date('2026-03-04T14:00:00')
    const slots: SubjectDetailSlot[] = [{ dayOfWeek: 3, startMinutes: 600, endMinutes: 660 }] // Wed 10:00, already passed

    const next = getNextClassOccurrence(slots, now)

    expect(next && localDateString(next)).toBe('2026-03-11') // next Wednesday
    expect(next?.getHours()).toBe(10)
  })

  it('keeps the same-day occurrence when its start time has not passed yet', () => {
    const now = new Date('2026-03-04T08:00:00') // Wednesday 08:00
    const slots: SubjectDetailSlot[] = [{ dayOfWeek: 3, startMinutes: 600, endMinutes: 660 }] // Wed 10:00, still ahead

    const next = getNextClassOccurrence(slots, now)

    expect(next && localDateString(next)).toBe('2026-03-04')
    expect(next?.getHours()).toBe(10)
  })

  // Week-boundary test (task 3.3): próxima clase must stay correct when
  // "today" sits exactly on the Sunday/Monday edge of the stored encoding.
  describe('week-boundary: today on the Sunday/Monday edge', () => {
    it('from Sunday night, a Monday-morning slot is "tomorrow", not 6 days away', () => {
      // 2026-03-01 is a Sunday.
      const now = new Date('2026-03-01T23:50:00')
      const slots: SubjectDetailSlot[] = [{ dayOfWeek: 1, startMinutes: 480, endMinutes: 540 }] // Monday 08:00

      const next = getNextClassOccurrence(slots, now)

      expect(next && localDateString(next)).toBe('2026-03-02') // the very next day
      expect(next?.getHours()).toBe(8)
    })

    it('a same-day Sunday slot whose time already passed rolls over a full week, not to "day 0" of the next day', () => {
      // 2026-03-01 is a Sunday, 23:50 local; the slot's own Sunday 23:00 has passed.
      const now = new Date('2026-03-01T23:50:00')
      const slots: SubjectDetailSlot[] = [{ dayOfWeek: 0, startMinutes: 1380, endMinutes: 1439 }] // Sunday 23:00

      const next = getNextClassOccurrence(slots, now)

      expect(next && localDateString(next)).toBe('2026-03-08') // next Sunday, not "today" or tomorrow
      expect(next?.getHours()).toBe(23)
    })

    it('from Monday morning, the nearest Sunday slot is 6 days away, not treated as "before" Monday', () => {
      // 2026-03-02 is a Monday.
      const now = new Date('2026-03-02T07:00:00')
      const slots: SubjectDetailSlot[] = [{ dayOfWeek: 0, startMinutes: 480, endMinutes: 540 }] // Sunday 08:00

      const next = getNextClassOccurrence(slots, now)

      expect(next && localDateString(next)).toBe('2026-03-08') // the following Sunday
      expect(next?.getHours()).toBe(8)
    })
  })

  // DST-transition test (task 3.2): America/New_York springs forward on
  // 2026-03-08 (02:00 -> 03:00). A slot must render at the same wall-clock
  // time on the far side of that transition, proving occurrences are
  // composed from local calendar date + minutes (date-fns addDays/set) and
  // never from adding fixed 24h/ms multiples to an instant.
  describe('DST-transition: week crossing the spring-forward shift', () => {
    it('a Monday 10:00 slot still renders at 10:00 local wall-clock on the Monday after the DST jump', () => {
      // 2026-03-05 is a Thursday, three calendar days (one of which loses an
      // hour) before the target Monday 2026-03-09.
      const now = new Date('2026-03-05T09:00:00')
      const slots: SubjectDetailSlot[] = [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 660 }] // Monday 10:00

      const next = getNextClassOccurrence(slots, now)

      expect(next && localDateString(next)).toBe('2026-03-09')
      expect(next?.getHours()).toBe(10)
      expect(next?.getMinutes()).toBe(0)
    })

    it('picks the earliest of two slots straddling the DST weekend, both still at their stored wall-clock time', () => {
      const now = new Date('2026-03-05T09:00:00') // Thursday
      const slots: SubjectDetailSlot[] = [
        { dayOfWeek: 1, startMinutes: 600, endMinutes: 660 }, // Monday 10:00 (after the jump)
        { dayOfWeek: 6, startMinutes: 540, endMinutes: 600 } // Saturday 09:00 (before the jump)
      ]

      const next = getNextClassOccurrence(slots, now)

      expect(next && localDateString(next)).toBe('2026-03-07') // Saturday is nearer
      expect(next?.getHours()).toBe(9)
    })
  })
})
