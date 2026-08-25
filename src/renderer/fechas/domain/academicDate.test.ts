import { describe, expect, it } from 'vitest'
import {
  classifyAcademicDate,
  classifyAcademicDateUrgency,
  daysUntilAcademicDate,
  formatAcademicDateLongRange,
  formatAcademicDateRange,
  formatAcademicDateStatus,
  formatAcademicDateStatusInline,
  groupAcademicDates,
  isAcademicDateWindow,
  isPastAcademicDate,
  listUpcomingAcademicDates,
  pickImminentAcademicDate,
  relevantAcademicDate
} from './academicDate'

// A Tuesday at midday, so nothing in these tests depends on the time of day.
const now = new Date(2026, 11, 1, 12, 0)

const dateWindow = { startsOn: '2026-12-01', endsOn: '2026-12-05' }
const singleDay = { startsOn: '2026-12-20', endsOn: null }

describe('relevantAcademicDate', () => {
  it('is the end of a window — what actually closes is the deadline', () => {
    expect(relevantAcademicDate(dateWindow)).toBe('2026-12-05')
  })

  it('is the start of a single-day date', () => {
    expect(relevantAcademicDate(singleDay)).toBe('2026-12-20')
  })
})

describe('isAcademicDateWindow', () => {
  it('is true only when there is an end to close', () => {
    expect(isAcademicDateWindow(dateWindow)).toBe(true)
    expect(isAcademicDateWindow(singleDay)).toBe(false)
  })
})

describe('daysUntilAcademicDate', () => {
  it('counts whole calendar days to the relevant date', () => {
    expect(daysUntilAcademicDate(dateWindow, now)).toBe(4)
    expect(daysUntilAcademicDate(singleDay, now)).toBe(19)
  })

  it('is zero on the closing day itself, whatever the time', () => {
    expect(daysUntilAcademicDate({ startsOn: '2026-12-01', endsOn: null }, new Date(2026, 11, 1, 23, 30))).toBe(0)
  })
})

describe('isPastAcademicDate', () => {
  it('is false while the window is still open, even once it has started', () => {
    expect(isPastAcademicDate(dateWindow, now)).toBe(false)
  })

  it('is false on the last day of the window — the day it closes is still a day you can act', () => {
    expect(isPastAcademicDate(dateWindow, new Date(2026, 11, 5, 23, 0))).toBe(false)
  })

  it('is true the day after the window closes', () => {
    expect(isPastAcademicDate(dateWindow, new Date(2026, 11, 6, 0, 30))).toBe(true)
  })

  it('is true the day after a single-day date', () => {
    expect(isPastAcademicDate(singleDay, new Date(2026, 11, 21, 8, 0))).toBe(true)
    expect(isPastAcademicDate(singleDay, new Date(2026, 11, 20, 8, 0))).toBe(false)
  })
})

describe('classifyAcademicDate (reuses the entregas bucket domain)', () => {
  it('buckets by the relevant date', () => {
    expect(classifyAcademicDate(dateWindow, now)).toBe('proximos7')
    expect(classifyAcademicDate(singleDay, now)).toBe('masAdelante')
  })

  // There is no `done` on an administrative date, so the bucket that means
  // "you finished this" is unreachable by construction.
  it.each([
    ['a window', dateWindow],
    ['a single-day date', singleDay],
    ['a past date', { startsOn: '2020-01-01', endsOn: null }]
  ])('never lands %s in COMPLETADAS', (_case, date) => {
    expect(classifyAcademicDate(date, now)).not.toBe('completadas')
  })
})

describe('classifyAcademicDateUrgency', () => {
  it('grades the same four levels the deadline pills use', () => {
    expect(classifyAcademicDateUrgency({ startsOn: '2026-11-20', endsOn: '2026-11-28' }, now)).toBe('overdue')
    expect(classifyAcademicDateUrgency({ startsOn: '2026-12-01', endsOn: '2026-12-02' }, now)).toBe('imminent')
    expect(classifyAcademicDateUrgency(dateWindow, now)).toBe('thisWeek')
    expect(classifyAcademicDateUrgency(singleDay, now)).toBe('later')
  })
})

describe('listUpcomingAcademicDates', () => {
  const dates = [
    { id: 1, ...singleDay },
    { id: 2, startsOn: '2020-01-01', endsOn: null },
    { id: 3, ...dateWindow }
  ]

  it('drops past dates and sorts by the relevant date', () => {
    expect(listUpcomingAcademicDates(dates, now).map((date) => date.id)).toEqual([3, 1])
  })
})

describe('pickImminentAcademicDate', () => {
  const dates = [
    { id: 1, ...singleDay },
    { id: 2, ...dateWindow }
  ]

  it('answers with the nearest upcoming date inside the 7-day horizon', () => {
    expect(pickImminentAcademicDate(dates, now)?.id).toBe(2)
  })

  it('answers null when nothing is near', () => {
    expect(pickImminentAcademicDate([{ id: 1, ...singleDay }], now)).toBeNull()
  })

  it('never answers with a past date', () => {
    expect(pickImminentAcademicDate([{ id: 1, startsOn: '2026-11-25', endsOn: '2026-11-30' }], now)).toBeNull()
  })

  it('includes a date closing today', () => {
    expect(pickImminentAcademicDate([{ id: 1, startsOn: '2026-11-25', endsOn: '2026-12-01' }], now)?.id).toBe(1)
  })
})

describe('groupAcademicDates', () => {
  it('groups upcoming dates into the entregas buckets, sorted within each', () => {
    const grouped = groupAcademicDates(
      [
        { id: 1, ...singleDay },
        { id: 2, ...dateWindow },
        { id: 3, startsOn: '2026-12-03', endsOn: null }
      ],
      now
    )

    expect(grouped.proximos7.map((date) => date.id)).toEqual([3, 2])
    expect(grouped.masAdelante.map((date) => date.id)).toEqual([1])
    expect(grouped.atrasadas).toEqual([])
    expect(grouped.completadas).toEqual([])
  })

  it('leaves past dates out of every bucket', () => {
    const grouped = groupAcademicDates([{ id: 1, startsOn: '2020-01-01', endsOn: null }], now)

    expect(Object.values(grouped).flat()).toEqual([])
  })
})

describe('formatAcademicDateRange (design node: the FECHAS ADMINISTRATIVAS card)', () => {
  it('prints a same-month window with the month once', () => {
    expect(formatAcademicDateRange('2026-12-01', '2026-12-05')).toBe('1 – 5 DIC')
  })

  it('prints a cross-month window with both months', () => {
    expect(formatAcademicDateRange('2026-11-28', '2026-12-05')).toBe('28 NOV – 5 DIC')
  })

  it('prints a single-day date as one day', () => {
    expect(formatAcademicDateRange('2026-12-20', null)).toBe('20 DIC')
  })

  // Same rule as `finales/domain/finalDate.ts`: showing the raw stored string
  // beats interpolating "undefined" into the card.
  it.each([
    ['a malformed start', '20/12/2026', null, '20/12/2026'],
    ['a month outside the catalogue', '2026-13-20', null, '2026-13-20'],
    ['a malformed end', '2026-12-01', 'diciembre', '2026-12-01 – diciembre']
  ])('returns %s unformatted', (_case, startsOn, endsOn, expected) => {
    expect(formatAcademicDateRange(startsOn, endsOn)).toBe(expected)
  })
})

describe('formatAcademicDateLongRange (the Hoy callout subtitle)', () => {
  it('prints a same-month window naming the month once', () => {
    expect(formatAcademicDateLongRange('2026-12-01', '2026-12-05')).toBe('Del 1 al 5 de diciembre')
  })

  it('prints a cross-month window naming both months', () => {
    expect(formatAcademicDateLongRange('2026-11-28', '2026-12-05')).toBe('Del 28 de noviembre al 5 de diciembre')
  })

  it('prints a single-day date as a day', () => {
    expect(formatAcademicDateLongRange('2026-12-20', null)).toBe('El 20 de diciembre')
  })

  it('returns a malformed date unformatted', () => {
    expect(formatAcademicDateLongRange('2026-13-20', null)).toBe('2026-13-20')
  })
})

describe('formatAcademicDateStatus', () => {
  it('says what closes, for a window', () => {
    expect(formatAcademicDateStatus(dateWindow, now)).toBe('Cierra en 4 días')
    expect(formatAcademicDateStatus({ startsOn: '2026-11-28', endsOn: '2026-12-02' }, now)).toBe('Cierra mañana')
    expect(formatAcademicDateStatus({ startsOn: '2026-11-28', endsOn: '2026-12-01' }, now)).toBe('Cierra hoy')
  })

  it('falls back to the standard relative copy for a single-day date', () => {
    expect(formatAcademicDateStatus(singleDay, now)).toBe('En 3 semanas')
    expect(formatAcademicDateStatus({ startsOn: '2026-12-04', endsOn: null }, now)).toBe('En 3 días')
    expect(formatAcademicDateStatus({ startsOn: '2026-12-02', endsOn: null }, now)).toBe('Mañana')
    expect(formatAcademicDateStatus({ startsOn: '2026-12-01', endsOn: null }, now)).toBe('Hoy')
  })

  it('has a lowercase inline variant for the callout headline', () => {
    expect(formatAcademicDateStatusInline(dateWindow, now)).toBe('cierra en 4 días')
    expect(formatAcademicDateStatusInline(singleDay, now)).toBe('en 3 semanas')
  })
})
