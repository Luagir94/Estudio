import { describe, expect, it } from 'vitest'
import {
  clashingSlotIds,
  type DraftSubject,
  findScheduleClashes,
  summarizeWeeklyLoad,
  WEEKLY_LOAD_REFERENCE_MINUTES,
  weeklyLoadFraction
} from './draftSchedule'

let nextSlotId = 1

function slot(dayOfWeek: number, startMinutes: number, endMinutes: number) {
  return { id: nextSlotId++, dayOfWeek, startMinutes, endMinutes, location: null }
}

function subject(id: number, name: string, slots: ReturnType<typeof slot>[]): DraftSubject {
  return { id, name, color: '#fff', slots }
}

const MONDAY = 1
const WEDNESDAY = 3

describe('findScheduleClashes', () => {
  it('finds nothing in an empty draft', () => {
    expect(findScheduleClashes([])).toEqual([])
  })

  it('finds nothing when a single subject is drafted', () => {
    expect(findScheduleClashes([subject(1, 'Análisis', [slot(MONDAY, 1080, 1260)])])).toEqual([])
  })

  it('finds nothing when two subjects are on different days', () => {
    const clashes = findScheduleClashes([
      subject(1, 'Análisis', [slot(MONDAY, 1080, 1260)]),
      subject(2, 'Física', [slot(WEDNESDAY, 1080, 1260)])
    ])

    expect(clashes).toEqual([])
  })

  // The design's own example: Redes 19:00–22:00 against Análisis 18:00–21:00
  // on Wednesday, overlapping 19:00–21:00.
  it('reports the pair, the day and the overlapping window', () => {
    const clashes = findScheduleClashes([
      subject(1, 'Análisis Matemático II', [slot(WEDNESDAY, 1080, 1260)]),
      subject(2, 'Redes de Computadoras', [slot(WEDNESDAY, 1140, 1320)])
    ])

    expect(clashes).toEqual([
      {
        first: { id: 1, name: 'Análisis Matemático II' },
        second: { id: 2, name: 'Redes de Computadoras' },
        dayOfWeek: WEDNESDAY,
        startMinutes: 1140,
        endMinutes: 1260
      }
    ])
  })

  // THE boundary: a class ending 21:00 and one starting 21:00 do not clash.
  // You walk out of one and into the other, which is a real timetable, not a
  // conflict — and reporting it would teach the student to ignore the notice.
  it('does not clash on touching endpoints', () => {
    const clashes = findScheduleClashes([
      subject(1, 'Análisis', [slot(MONDAY, 1080, 1260)]),
      subject(2, 'Física', [slot(MONDAY, 1260, 1380)])
    ])

    expect(clashes).toEqual([])
  })

  it('does not clash on touching endpoints in the other order', () => {
    const clashes = findScheduleClashes([
      subject(1, 'Física', [slot(MONDAY, 1260, 1380)]),
      subject(2, 'Análisis', [slot(MONDAY, 1080, 1260)])
    ])

    expect(clashes).toEqual([])
  })

  // A single shared minute is an overlap: at 21:00 you are in two classrooms.
  it('clashes on a one-minute overlap', () => {
    const clashes = findScheduleClashes([
      subject(1, 'Análisis', [slot(MONDAY, 1080, 1261)]),
      subject(2, 'Física', [slot(MONDAY, 1260, 1380)])
    ])

    expect(clashes).toHaveLength(1)
    expect(clashes[0]).toMatchObject({ startMinutes: 1260, endMinutes: 1261 })
  })

  it('reports a fully contained class as the contained window', () => {
    const clashes = findScheduleClashes([
      subject(1, 'Análisis', [slot(MONDAY, 1080, 1380)]),
      subject(2, 'Física', [slot(MONDAY, 1140, 1200)])
    ])

    expect(clashes[0]).toMatchObject({ startMinutes: 1140, endMinutes: 1200 })
  })

  // Two slots of the SAME materia are not a clash with themselves — a subject
  // cannot collide with its own timetable.
  it('never clashes a subject with itself', () => {
    const clashes = findScheduleClashes([subject(1, 'Análisis', [slot(MONDAY, 1080, 1260), slot(MONDAY, 1140, 1320)])])

    expect(clashes).toEqual([])
  })

  it('reports one clash per overlapping day', () => {
    const clashes = findScheduleClashes([
      subject(1, 'Análisis', [slot(MONDAY, 1080, 1260), slot(WEDNESDAY, 1080, 1260)]),
      subject(2, 'Redes', [slot(MONDAY, 1140, 1320), slot(WEDNESDAY, 1140, 1320)])
    ])

    expect(clashes).toHaveLength(2)
    expect(clashes.map((clash) => clash.dayOfWeek).sort()).toEqual([MONDAY, WEDNESDAY])
  })

  it('reports a pair once per overlapping window, in the day order the week runs', () => {
    const clashes = findScheduleClashes([
      subject(1, 'Análisis', [slot(WEDNESDAY, 1080, 1260)]),
      subject(2, 'Redes', [slot(MONDAY, 1140, 1320)]),
      subject(3, 'Física', [slot(MONDAY, 1200, 1320), slot(WEDNESDAY, 1140, 1200)])
    ])

    // Monday before Wednesday: the projection this rides on is Monday-first.
    expect(clashes.map((clash) => clash.dayOfWeek)).toEqual([MONDAY, WEDNESDAY])
  })

  // Sunday sorts LAST in a Monday-first week, which is the order the notice
  // list is read in.
  it('places Sunday last', () => {
    const clashes = findScheduleClashes([
      subject(1, 'Análisis', [slot(0, 600, 720), slot(MONDAY, 600, 720)]),
      subject(2, 'Redes', [slot(0, 660, 780), slot(MONDAY, 660, 780)])
    ])

    expect(clashes.map((clash) => clash.dayOfWeek)).toEqual([MONDAY, 0])
  })
})

describe('clashingSlotIds', () => {
  it('finds nothing without clashes', () => {
    expect(clashingSlotIds([subject(1, 'Análisis', [slot(MONDAY, 1080, 1260)])], [])).toEqual(new Set())
  })

  // The point of the whole helper: a materia that meets four times a week and
  // collides once is NOT four collisions. Widening the mark to the materia
  // would tell the student to fix a timetable that is mostly fine.
  it('marks only the class inside the overlapping window', () => {
    const monday = slot(MONDAY, 480, 540)
    const wednesday = slot(WEDNESDAY, 480, 540)
    const clashes = findScheduleClashes([
      subject(1, 'ITICS', [monday, wednesday]),
      subject(2, 'Redes', [slot(MONDAY, 480, 540)])
    ])

    const marked = clashingSlotIds([subject(1, 'ITICS', [monday, wednesday])], clashes)

    expect(marked.has(monday.id)).toBe(true)
    expect(marked.has(wednesday.id)).toBe(false)
  })

  it('marks the class on BOTH sides of the collision', () => {
    const mine = slot(MONDAY, 480, 600)
    const theirs = slot(MONDAY, 540, 660)
    const draft = [subject(1, 'ITICS', [mine]), subject(2, 'Redes', [theirs])]

    const marked = clashingSlotIds(draft, findScheduleClashes(draft))

    expect(marked).toEqual(new Set([mine.id, theirs.id]))
  })

  // Same line `findScheduleClashes` holds: a class ending 21:00 and one
  // starting 21:00 is a real timetable, so nothing is marked either.
  it('leaves touching endpoints alone', () => {
    const draft = [subject(1, 'Análisis', [slot(MONDAY, 1080, 1260)]), subject(2, 'Redes', [slot(MONDAY, 1260, 1380)])]

    expect(clashingSlotIds(draft, findScheduleClashes(draft))).toEqual(new Set())
  })
})

describe('summarizeWeeklyLoad', () => {
  it('reads an empty draft as nothing', () => {
    expect(summarizeWeeklyLoad([])).toEqual({ totalMinutes: 0, classCount: 0, subjectCount: 0 })
  })

  // Three materias, five classes: 2×3h + 1×2h + 2×3h = 14 h a week.
  it('totals minutes, classes and subjects across the draft', () => {
    const load = summarizeWeeklyLoad([
      subject(1, 'Análisis', [slot(MONDAY, 1080, 1260), slot(WEDNESDAY, 1080, 1260)]),
      subject(2, 'Física', [slot(2, 1140, 1260)]),
      subject(3, 'Redes', [slot(WEDNESDAY, 1140, 1320), slot(4, 1140, 1320)])
    ])

    expect(load).toEqual({ totalMinutes: 14 * 60, classCount: 5, subjectCount: 3 })
  })

  // A drafted materia with no horario loaded still counts as a materia — it is
  // in the plan; what it costs per week is simply not known yet.
  it('counts a subject with no slots', () => {
    expect(summarizeWeeklyLoad([subject(1, 'Sin horario', [])])).toEqual({
      totalMinutes: 0,
      classCount: 0,
      subjectCount: 1
    })
  })
})

describe('weeklyLoadFraction', () => {
  it('is zero for an empty draft', () => {
    expect(weeklyLoadFraction(0)).toBe(0)
  })

  it('is one at the reference load', () => {
    expect(weeklyLoadFraction(WEEKLY_LOAD_REFERENCE_MINUTES)).toBe(1)
  })

  it('is a half at half the reference load', () => {
    expect(weeklyLoadFraction(WEEKLY_LOAD_REFERENCE_MINUTES / 2)).toBe(0.5)
  })

  // The bar is a reading, not a limit. Overshooting the reference fills it and
  // stops — it never overflows its track, and it never turns into a refusal.
  it('caps at one past the reference load', () => {
    expect(weeklyLoadFraction(WEEKLY_LOAD_REFERENCE_MINUTES * 3)).toBe(1)
  })
})
