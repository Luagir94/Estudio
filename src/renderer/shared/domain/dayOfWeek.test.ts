import { describe, expect, it } from 'vitest'
import { fromMondayFirstIndex, toMondayFirstIndex } from './dayOfWeek'

// Gate finding (sdd/course-companion/gate-findings/slice-2a, Finding 2): storage
// uses JS `Date.getDay()` semantics (0=Sunday..6=Saturday), but the Horario grid
// and the dashboard week strip both start on Monday. This table-driven test
// pins down the mapping explicitly so slice 3 does not have to re-derive it,
// with special attention to Sunday moving from first position to last.
describe('toMondayFirstIndex (stored Sunday-based dayOfWeek -> Monday-first display index)', () => {
  it.each([
    { dayOfWeek: 1, label: 'Monday', expectedIndex: 0 },
    { dayOfWeek: 2, label: 'Tuesday', expectedIndex: 1 },
    { dayOfWeek: 3, label: 'Wednesday', expectedIndex: 2 },
    { dayOfWeek: 4, label: 'Thursday', expectedIndex: 3 },
    { dayOfWeek: 5, label: 'Friday', expectedIndex: 4 },
    { dayOfWeek: 6, label: 'Saturday', expectedIndex: 5 },
    { dayOfWeek: 0, label: 'Sunday', expectedIndex: 6 }
  ])(
    'maps stored dayOfWeek=$dayOfWeek ($label) to Monday-first index $expectedIndex',
    ({ dayOfWeek, expectedIndex }) => {
      expect(toMondayFirstIndex(dayOfWeek)).toBe(expectedIndex)
    }
  )
})

describe('fromMondayFirstIndex (Monday-first display index -> stored Sunday-based dayOfWeek)', () => {
  it.each([
    { mondayFirstIndex: 0, label: 'Monday', expectedDayOfWeek: 1 },
    { mondayFirstIndex: 1, label: 'Tuesday', expectedDayOfWeek: 2 },
    { mondayFirstIndex: 2, label: 'Wednesday', expectedDayOfWeek: 3 },
    { mondayFirstIndex: 3, label: 'Thursday', expectedDayOfWeek: 4 },
    { mondayFirstIndex: 4, label: 'Friday', expectedDayOfWeek: 5 },
    { mondayFirstIndex: 5, label: 'Saturday', expectedDayOfWeek: 6 },
    { mondayFirstIndex: 6, label: 'Sunday', expectedDayOfWeek: 0 }
  ])(
    'maps Monday-first index $mondayFirstIndex ($label) back to stored dayOfWeek $expectedDayOfWeek',
    ({ mondayFirstIndex, expectedDayOfWeek }) => {
      expect(fromMondayFirstIndex(mondayFirstIndex)).toBe(expectedDayOfWeek)
    }
  )

  it('round-trips every day of the week through both directions', () => {
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
      expect(fromMondayFirstIndex(toMondayFirstIndex(dayOfWeek))).toBe(dayOfWeek)
    }
  })
})
