import { beforeAll, describe, expect, it } from 'vitest'
import {
  FREE_BLOCK_THRESHOLD_MINUTES,
  getDashboardDeadlines,
  getFreeBlocks,
  getNextClassHighlight,
  getNextClassOccurrence,
  getTodayClasses,
  getWeekStrip,
  withClassMarks,
  type DashboardDeadline,
  type DashboardSubject
} from './dashboard'

// Deadline classification exercises real wall-clock local-time arithmetic
// (design §3a "the DST rule"); pin the process timezone deterministically —
// same precedent as entregas/domain/deadline.test.ts.
beforeAll(() => {
  process.env.TZ = 'America/New_York'
})

const subjects: DashboardSubject[] = [
  {
    id: 1,
    name: 'Sistemas Operativos',
    color: '#4c8dff',
    slots: [{ id: 10, dayOfWeek: 4, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }] // Thursday 08:00-09:30
  },
  {
    id: 2,
    name: 'Bases de Datos',
    color: '#2dd4a7',
    slots: [{ id: 20, dayOfWeek: 4, startMinutes: 600, endMinutes: 720, location: 'Aula 118' }] // Thursday 10:00-12:00
  },
  {
    id: 3,
    name: 'Ingeniería de Software',
    color: '#a78bfa',
    slots: [{ id: 30, dayOfWeek: 4, startMinutes: 1110, endMinutes: 1290, location: 'Aula 301' }] // Thursday 18:30-21:30
  },
  {
    id: 4,
    name: 'Redes de Computadoras',
    color: '#fb923c',
    slots: [{ id: 40, dayOfWeek: 2, startMinutes: 480, endMinutes: 570, location: null }] // Tuesday — not today
  }
]

describe("getTodayClasses (task 6.1: today's classes, zero new persisted fields)", () => {
  it("returns only slots on now's dayOfWeek, sorted ascending by start time", () => {
    const now = new Date(2026, 7, 13, 9, 0) // Thursday 2026-08-13
    expect(now.getDay()).toBe(4)

    const classes = getTodayClasses(subjects, now)

    expect(classes.map((c) => c.subjectName)).toEqual([
      'Sistemas Operativos',
      'Bases de Datos',
      'Ingeniería de Software'
    ])
  })

  it('returns an empty array when nothing is scheduled today', () => {
    const now = new Date(2026, 7, 15, 9, 0) // Saturday — no slots at all
    expect(getTodayClasses(subjects, now)).toEqual([])
  })

  it('can any class today go unsurfaced? No — every dayOfWeek value (0..6) is a valid filter target, no hour-range gate exists', () => {
    // A class scheduled very late (23:00) or very early (00:00) today must
    // still appear — getTodayClasses filters ONLY by dayOfWeek, never by an
    // hour-of-day window (editor/viewer consistency check, carried in from
    // sdd/course-companion/bugfix/horario-weekend-columns).
    const lateSubjects: DashboardSubject[] = [
      {
        id: 9,
        name: 'Seminario nocturno',
        color: '#f472b6',
        slots: [{ id: 90, dayOfWeek: 4, startMinutes: 1380, endMinutes: 1430, location: null }]
      }
    ]
    const now = new Date(2026, 7, 13, 9, 0) // Thursday

    expect(getTodayClasses(lateSubjects, now).map((c) => c.subjectName)).toEqual(['Seminario nocturno'])
  })
})

describe("getFreeBlocks (design node NBahI: gaps of at least 2h between today's classes)", () => {
  it('reports only the gap at/above the threshold, not the smaller one', () => {
    const now = new Date(2026, 7, 13, 9, 0)
    const classes = getTodayClasses(subjects, now)

    const blocks = getFreeBlocks(classes)

    expect(blocks).toEqual([
      { gapMinutes: 390, afterSubjectName: 'Bases de Datos', beforeSubjectName: 'Ingeniería de Software' }
    ])
  })

  it('the threshold is exactly 120 minutes, exported for reuse/documentation', () => {
    expect(FREE_BLOCK_THRESHOLD_MINUTES).toBe(120)
  })

  it('returns an empty array with 0 or 1 classes today', () => {
    expect(getFreeBlocks([])).toEqual([])
  })
})

const deadlines: DashboardDeadline[] = [
  {
    id: 1,
    subjectId: 3,
    subjectName: 'Ingeniería de Software',
    subjectColor: '#a78bfa',
    title: 'Informe de lectura 2',
    type: 'Informe',
    dueAt: '2026-08-12T23:59', // overdue relative to "now" below
    done: false
  },
  {
    id: 2,
    subjectId: 2,
    subjectName: 'Bases de Datos',
    subjectColor: '#2dd4a7',
    title: 'Parcial 1',
    type: 'Examen final',
    dueAt: '2026-08-19T10:00', // within 7 days
    done: false
  },
  {
    id: 3,
    subjectId: 1,
    subjectName: 'Sistemas Operativos',
    subjectColor: '#4c8dff',
    title: 'TP lejano',
    type: 'Trabajo práctico',
    dueAt: '2026-12-01T10:00', // far in the future — MÁS ADELANTE
    done: false
  },
  {
    id: 4,
    subjectId: 1,
    subjectName: 'Sistemas Operativos',
    subjectColor: '#4c8dff',
    title: 'Ya entregado',
    type: 'Informe',
    dueAt: '2026-08-01T10:00', // done — must never read as overdue
    done: true
  }
]

describe('getDashboardDeadlines (spec: "Overdue Surfacing" — overdue deadlines MUST be surfaced on Hoy)', () => {
  it('includes overdue AND within-7-days deadlines, excludes MÁS ADELANTE and COMPLETADAS', () => {
    const now = new Date(2026, 7, 13, 9, 0) // Thursday 2026-08-13

    const result = getDashboardDeadlines(deadlines, now)

    expect(result.map((d) => d.title)).toEqual(['Informe de lectura 2', 'Parcial 1'])
  })

  it('sorts ascending by fecha límite — overdue items surface first', () => {
    const now = new Date(2026, 7, 13, 9, 0)

    const result = getDashboardDeadlines(deadlines, now)

    expect(result[0]!.title).toBe('Informe de lectura 2')
  })
})

describe('getNextClassHighlight (in-progress-first rule: highlight the class running NOW, else the next upcoming one)', () => {
  // Thursday's classes from the shared fixture, already sorted by start:
  // Sistemas Operativos 08:00-09:30 (slot 10), Bases de Datos 10:00-12:00
  // (slot 20), Ingeniería de Software 18:30-21:30 (slot 30).
  const classes = getTodayClasses(subjects, new Date(2026, 7, 13, 9, 0))

  it('before the first class, highlights it with positive minutes until start', () => {
    const now = new Date(2026, 7, 13, 7, 15)
    expect(getNextClassHighlight(classes, now)).toEqual({ slotId: 10, minutesUntilStart: 45 })
  })

  it('between two classes, highlights the upcoming one, never the finished one', () => {
    const now = new Date(2026, 7, 13, 17, 45)
    expect(getNextClassHighlight(classes, now)).toEqual({ slotId: 30, minutesUntilStart: 45 })
  })

  it('during a class, highlights the in-progress class with negative minutes (in-progress-first rule)', () => {
    const now = new Date(2026, 7, 13, 10, 30)
    expect(getNextClassHighlight(classes, now)).toEqual({ slotId: 20, minutesUntilStart: -30 })
  })

  it('a class starting exactly now is in progress: zero minutes, not "in 0 minutes"', () => {
    const now = new Date(2026, 7, 13, 10, 0)
    expect(getNextClassHighlight(classes, now)).toEqual({ slotId: 20, minutesUntilStart: 0 })
  })

  it('at the exact end of the last class, highlights nothing — the day is over', () => {
    const now = new Date(2026, 7, 13, 21, 30)
    expect(getNextClassHighlight(classes, now)).toBeNull()
  })

  it('returns null for an empty class list', () => {
    expect(getNextClassHighlight([], new Date(2026, 7, 13, 9, 0))).toBeNull()
  })
})

describe('getNextClassOccurrence (Hoy empty state: the next class across the weekly pattern)', () => {
  // Shared fixture: Thursday holds three classes (08:00 Sistemas Operativos,
  // 10:00 Bases de Datos, 18:30 Ingeniería de Software); Tuesday holds one
  // (08:00 Redes de Computadoras). Saturday/Sunday/Monday... hold none.

  it('finds the earliest class on the nearest upcoming day', () => {
    const now = new Date(2026, 7, 15, 9, 0) // Saturday — nearest is Tuesday's Redes
    expect(now.getDay()).toBe(6)

    expect(getNextClassOccurrence(subjects, now)).toEqual({
      daysAhead: 3,
      dayOfWeek: 2,
      startMinutes: 480,
      subjectName: 'Redes de Computadoras'
    })
  })

  it('picks the earliest start when the upcoming day holds several classes', () => {
    const now = new Date(2026, 7, 12, 9, 0) // Wednesday — Thursday has three classes
    expect(now.getDay()).toBe(3)

    expect(getNextClassOccurrence(subjects, now)).toEqual({
      daysAhead: 1,
      dayOfWeek: 4,
      startMinutes: 480,
      subjectName: 'Sistemas Operativos'
    })
  })

  it('wraps across the weekend — a weekly pattern has no "end of week"', () => {
    const now = new Date(2026, 7, 14, 9, 0) // Friday — nothing until next Tuesday
    expect(now.getDay()).toBe(5)

    expect(getNextClassOccurrence(subjects, now)?.daysAhead).toBe(4)
  })

  it('never answers with a class TODAY — "next" starts tomorrow', () => {
    const now = new Date(2026, 7, 13, 7, 0) // Thursday BEFORE its own classes
    expect(now.getDay()).toBe(4)

    // Today's Thursday classes are skipped; the next occurrence is Tuesday's.
    expect(getNextClassOccurrence(subjects, now)?.dayOfWeek).toBe(2)
  })

  it('returns null when no subject has any slot', () => {
    const bare: DashboardSubject[] = [{ id: 1, name: 'Sin horario', color: '#4c8dff', slots: [] }]
    expect(getNextClassOccurrence(bare, new Date(2026, 7, 15, 9, 0))).toBeNull()
  })
})

describe('getWeekStrip (task 6.2: week-strip Monday-start test)', () => {
  it('always starts the strip on Monday, ends on Sunday, regardless of what day "now" is', () => {
    const now = new Date(2026, 7, 13, 9, 0) // Thursday 2026-08-13

    const strip = getWeekStrip(subjects, deadlines, now)

    expect(strip).toHaveLength(7)
    expect(strip[0]!.date.getDay()).toBe(1) // Monday
    expect(strip[0]!.date.getDate()).toBe(10) // 2026-08-10 is that week's Monday
    expect(strip[6]!.date.getDay()).toBe(0) // Sunday
    expect(strip[6]!.date.getDate()).toBe(16)
  })

  it('collects one class color per slot that day, in start-time order', () => {
    const now = new Date(2026, 7, 13, 9, 0)

    const strip = getWeekStrip(subjects, deadlines, now)
    const thursday = strip[3]! // Monday-first index 3 = Thursday

    expect(thursday.classColors).toEqual(['#4c8dff', '#2dd4a7', '#a78bfa'])
  })

  it('counts only PENDING deadlines due that calendar day (design node eHE58 "Due Marker")', () => {
    const now = new Date(2026, 7, 13, 9, 0)

    const strip = getWeekStrip(subjects, [{ ...deadlines[1]!, dueAt: '2026-08-14T10:00' }], now)
    const friday = strip[4]! // Monday-first index 4 = Friday 2026-08-14

    expect(friday.dueCount).toBe(1)
  })
})

describe('withClassMarks (joins the day`s classes to what was recorded about them)', () => {
  const todayClasses = [
    {
      subjectId: 1,
      subjectName: 'Sistemas Operativos',
      subjectColor: '#4c8dff',
      slotId: 10,
      startMinutes: 480,
      endMinutes: 570,
      location: 'Aula 204'
    },
    {
      subjectId: 2,
      subjectName: 'Bases de Datos',
      subjectColor: '#22d3ee',
      slotId: 11,
      startMinutes: 600,
      endMinutes: 720,
      location: 'Aula 118'
    }
  ]

  it('carries each class`s mark and whether it has an apunte', () => {
    const marked = withClassMarks(
      todayClasses,
      [{ id: 1, subjectId: 1, date: '2026-08-14', status: 'presente' }],
      [{ id: 1, subjectId: 2, date: '2026-08-14', body: 'Índices' }],
      '2026-08-14'
    )

    expect(marked[0]).toMatchObject({ subjectId: 1, attendanceStatus: 'presente', hasNote: false })
    expect(marked[1]).toMatchObject({ subjectId: 2, attendanceStatus: null, hasNote: true })
  })

  // The join key is `(subjectId, date)`, never the slot id: a mark recorded on
  // another day belongs to another class.
  it('ignores marks recorded on a different day', () => {
    const marked = withClassMarks(
      todayClasses,
      [{ id: 1, subjectId: 1, date: '2026-08-07', status: 'ausente' }],
      [],
      '2026-08-14'
    )

    expect(marked[0]?.attendanceStatus).toBeNull()
  })

  it('leaves every class unmarked when nothing was recorded', () => {
    const marked = withClassMarks(todayClasses, [], [], '2026-08-14')

    expect(marked.every((classItem) => classItem.attendanceStatus === null && !classItem.hasNote)).toBe(true)
  })
})
