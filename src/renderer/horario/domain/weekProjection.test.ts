import { beforeAll, describe, expect, it } from 'vitest'
import {
  getNowOffsetFraction,
  getWeekOccurrenceDate,
  hasWeekendClasses,
  layoutDaySlots,
  projectWeek,
  type WeekProjectionSlot,
  type WeekProjectionSubject
} from './weekProjection'

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

    const monday = columns[0]!
    expect(monday.dayOfWeek).toBe(1)
    expect(monday.slots).toEqual([
      expect.objectContaining({ slotId: 10, subjectName: 'Sistemas Operativos', startMinutes: 480 })
    ])

    // Sunday must land LAST (index 6), not first — this is precisely the
    // off-by-one class of bug gate-findings/slice-2a Finding 2 warned about.
    const sunday = columns[6]!
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
    const wednesday = columns[2]!

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

describe('hasWeekendClasses (weekend-collapse rule: both weekend days empty -> collapsed columns)', () => {
  const slot = { subjectId: 1, subjectName: 'Taller', subjectColor: '#4c8dff', location: null }

  function columnsWith(dayOfWeek: number | null): ReturnType<typeof projectWeek> {
    const columns = projectWeek([])
    if (dayOfWeek !== null) {
      const index = columns.findIndex((column) => column.dayOfWeek === dayOfWeek)
      columns[index]!.slots.push({ ...slot, slotId: 99, dayOfWeek, startMinutes: 540, endMinutes: 660 })
    }
    return columns
  }

  it('is false when neither Saturday nor Sunday has a class', () => {
    expect(hasWeekendClasses(columnsWith(null))).toBe(false)
    expect(hasWeekendClasses(columnsWith(3))).toBe(false) // a weekday class changes nothing
  })

  it('is true when Saturday (stored dayOfWeek 6) has a class', () => {
    expect(hasWeekendClasses(columnsWith(6))).toBe(true)
  })

  it('is true when Sunday (stored dayOfWeek 0) has a class', () => {
    expect(hasWeekendClasses(columnsWith(0))).toBe(true)
  })
})

describe('getNowOffsetFraction (the Horario grid\'s "now" line, on the same minutes scale as class blocks)', () => {
  it('maps the start of the range to 0 and the midpoint to 0.5', () => {
    expect(getNowOffsetFraction(new Date(2026, 7, 13, 8, 0), 480, 1440)).toBe(0)
    expect(getNowOffsetFraction(new Date(2026, 7, 13, 16, 0), 480, 1440)).toBe(0.5)
  })

  it('returns null before the range opens', () => {
    expect(getNowOffsetFraction(new Date(2026, 7, 13, 7, 59), 480, 1440)).toBeNull()
  })

  it('stays inside the range up to its exclusive end (23:59 for a 24:00 cut-off)', () => {
    expect(getNowOffsetFraction(new Date(2026, 7, 13, 23, 59), 480, 1440)).toBeCloseTo(959 / 960)
  })

  it('returns null at an end boundary that midnight can actually reach (a 20:00 cut-off)', () => {
    expect(getNowOffsetFraction(new Date(2026, 7, 13, 20, 0), 480, 1200)).toBeNull()
  })
})

describe('layoutDaySlots (side-by-side lanes for classes that share the same hours)', () => {
  function slot(slotId: number, startMinutes: number, endMinutes: number): WeekProjectionSlot {
    return {
      subjectId: slotId,
      subjectName: `Materia ${slotId}`,
      subjectColor: '#4c8dff',
      slotId,
      dayOfWeek: 1,
      startMinutes,
      endMinutes,
      location: null
    }
  }

  it('gives a day with no collisions a single full-width lane per slot', () => {
    const laid = layoutDaySlots([slot(1, 480, 540), slot(2, 600, 660)])

    expect(laid.map(({ slotId, lane, laneCount }) => ({ slotId, lane, laneCount }))).toEqual([
      { slotId: 1, lane: 0, laneCount: 1 },
      { slotId: 2, lane: 0, laneCount: 1 }
    ])
  })

  // The bug this whole feature exists for: two classes at the same hour used
  // to be painted on top of each other, so only the last one drawn was
  // readable and the other silently vanished from the week.
  it('splits two classes sharing the same hour into two lanes', () => {
    const laid = layoutDaySlots([slot(1, 480, 540), slot(2, 480, 540)])

    expect(laid.map(({ slotId, lane, laneCount }) => ({ slotId, lane, laneCount }))).toEqual([
      { slotId: 1, lane: 0, laneCount: 2 },
      { slotId: 2, lane: 1, laneCount: 2 }
    ])
  })

  // Back-to-back classes are not a collision (slotOverlap's half-open rule),
  // so they must NOT cost the day half its width.
  it('keeps back-to-back classes on one lane', () => {
    const laid = layoutDaySlots([slot(1, 480, 540), slot(2, 540, 600)])

    expect(laid.every(({ lane, laneCount }) => lane === 0 && laneCount === 1)).toBe(true)
  })

  // A long class overlapping two short consecutive ones needs TWO lanes, not
  // three: the shorts do not overlap each other, so the second reuses the
  // lane the first has already vacated.
  it('reuses a freed lane inside the same cluster instead of adding one', () => {
    const laid = layoutDaySlots([slot(1, 480, 720), slot(2, 540, 600), slot(3, 600, 660)])

    expect(laid.map(({ slotId, lane, laneCount }) => ({ slotId, lane, laneCount }))).toEqual([
      { slotId: 1, lane: 0, laneCount: 2 },
      { slotId: 2, lane: 1, laneCount: 2 },
      { slotId: 3, lane: 1, laneCount: 2 }
    ])
  })

  // Width is decided per cluster, not per day: an afternoon class alone on
  // the calendar keeps the whole column even though the morning is split.
  it('scopes laneCount to each cluster of touching classes', () => {
    const laid = layoutDaySlots([slot(1, 480, 540), slot(2, 480, 540), slot(3, 840, 900)])

    expect(laid.map(({ slotId, laneCount }) => ({ slotId, laneCount }))).toEqual([
      { slotId: 1, laneCount: 2 },
      { slotId: 2, laneCount: 2 },
      { slotId: 3, laneCount: 1 }
    ])
  })

  it('carries every projection field through untouched', () => {
    const [laid] = layoutDaySlots([slot(7, 480, 540)])

    expect(laid).toMatchObject(slot(7, 480, 540))
  })

  it('returns an empty layout for an empty day', () => {
    expect(layoutDaySlots([])).toEqual([])
  })
})
