import { describe, expect, it } from 'vitest'
import type { TimelineMarkerRecord } from '../../../shared/ipc/carreras'
import {
  compareTimelineMarkers,
  groupNearbyMarkers,
  isUpcomingMarker,
  layoutPeriodMarkers,
  markerKey,
  TIMELINE_MARKER_KINDS,
  type PositionedTimelineMarker
} from './timelineMarkers'

function marker(overrides: Partial<TimelineMarkerRecord> = {}): TimelineMarkerRecord {
  return {
    kind: 'parcial',
    id: 1,
    subjectId: 10,
    periodId: 100,
    subjectName: 'Física I',
    label: 'Parcial 1',
    date: '2026-09-01',
    ...overrides
  }
}

describe('TIMELINE_MARKER_KINDS', () => {
  it('lists the three kinds in legend/tie-break order', () => {
    expect(TIMELINE_MARKER_KINDS).toEqual(['parcial', 'final', 'entrega'])
  })
})

describe('markerKey', () => {
  it('combines kind and id so ids colliding across kinds stay distinct', () => {
    expect(markerKey({ kind: 'parcial', id: 7 })).toBe('parcial-7')
    expect(markerKey({ kind: 'final', id: 7 })).toBe('final-7')
  })
})

describe('isUpcomingMarker', () => {
  it('treats a marker dated today as upcoming', () => {
    const today = new Date(2026, 8, 1)

    expect(isUpcomingMarker(marker({ date: '2026-09-01' }), today)).toBe(true)
  })

  it('excludes a marker dated yesterday', () => {
    const today = new Date(2026, 8, 1)

    expect(isUpcomingMarker(marker({ date: '2026-08-31' }), today)).toBe(false)
  })

  it('truncates the clock to its local calendar day, ignoring the time of day', () => {
    // Almost midnight on 2026-09-01 must still compare as 2026-09-01, not
    // roll forward the way a naive UTC read could in a timezone east of
    // Greenwich, and not roll back the way `toISOString()` could west of it.
    const almostMidnight = new Date(2026, 8, 1, 23, 59, 0)

    expect(isUpcomingMarker(marker({ date: '2026-09-01' }), almostMidnight)).toBe(true)
    expect(isUpcomingMarker(marker({ date: '2026-08-31' }), almostMidnight)).toBe(false)
  })
})

describe('compareTimelineMarkers', () => {
  it('orders by date ascending first', () => {
    const later = marker({ id: 1, date: '2026-09-05' })
    const earlier = marker({ id: 2, date: '2026-09-01' })

    expect([later, earlier].sort(compareTimelineMarkers)).toEqual([earlier, later])
  })

  it('breaks a date tie by TIMELINE_MARKER_KINDS order (parcial, final, entrega)', () => {
    const entrega = marker({ id: 1, kind: 'entrega', date: '2026-09-01' })
    const parcial = marker({ id: 2, kind: 'parcial', date: '2026-09-01' })
    const final = marker({ id: 3, kind: 'final', date: '2026-09-01' })

    expect([entrega, final, parcial].sort(compareTimelineMarkers)).toEqual([parcial, final, entrega])
  })

  it('breaks a date+kind tie by subjectName.localeCompare', () => {
    const zeta = marker({ id: 1, kind: 'parcial', date: '2026-09-01', subjectName: 'Zeta' })
    const alfa = marker({ id: 2, kind: 'parcial', date: '2026-09-01', subjectName: 'Alfa' })

    expect([zeta, alfa].sort(compareTimelineMarkers)).toEqual([alfa, zeta])
  })

  it('breaks a full tie by id ascending', () => {
    const higher = marker({ id: 9, kind: 'parcial', date: '2026-09-01', subjectName: 'Física' })
    const lower = marker({ id: 3, kind: 'parcial', date: '2026-09-01', subjectName: 'Física' })

    expect([higher, lower].sort(compareTimelineMarkers)).toEqual([lower, higher])
  })
})

function positioned(left: number, overrides: Partial<TimelineMarkerRecord> = {}): PositionedTimelineMarker {
  return { marker: marker(overrides), left }
}

describe('groupNearbyMarkers', () => {
  it('returns [] for empty input', () => {
    expect(groupNearbyMarkers([])).toEqual([])
  })

  it('returns every item as its own single group when thresholdPercent <= 0', () => {
    const items = [positioned(0, { id: 1 }), positioned(0.5, { id: 2 })]

    const groups = groupNearbyMarkers(items, 0)

    expect(groups).toEqual([
      { type: 'single', left: 0, marker: items[0]!.marker },
      { type: 'single', left: 0.5, marker: items[1]!.marker }
    ])
  })

  it('is order-independent: the same set groups the same way regardless of input order', () => {
    const a = positioned(10, { id: 1 })
    const b = positioned(1, { id: 2 })
    const c = positioned(1.5, { id: 3 })

    const fromOneOrder = groupNearbyMarkers([a, b, c])
    const fromAnotherOrder = groupNearbyMarkers([c, a, b])

    expect(fromOneOrder).toEqual(fromAnotherOrder)
  })

  it('is stable on an exact left tie, breaking it by compareTimelineMarkers', () => {
    const zeta = positioned(5, { id: 1, subjectName: 'Zeta' })
    const alfa = positioned(5, { id: 2, subjectName: 'Alfa' })

    // Two items at the identical position (diff 0 <= threshold) join one
    // cluster; the cluster's `markers` are re-sorted, so the tie-broken
    // order is deterministic regardless of input order.
    const groups = groupNearbyMarkers([zeta, alfa])

    expect(groups).toEqual([{ type: 'cluster', left: 5, markers: [alfa.marker, zeta.marker] }])
  })

  it('emits a centroid left for a cluster', () => {
    const groups = groupNearbyMarkers([positioned(0, { id: 1 }), positioned(1, { id: 2 })])

    expect(groups).toEqual([{ type: 'cluster', left: 0.5, markers: [expect.anything(), expect.anything()] }])
  })

  it('includes the exact-threshold distance in one group (inclusive boundary)', () => {
    const groups = groupNearbyMarkers([positioned(0, { id: 1 }), positioned(2.5, { id: 2 })], 2.5)

    expect(groups).toHaveLength(1)
    expect(groups[0]!.type).toBe('cluster')
  })

  it('single-linkage chains through the last appended member, so adjacent groups end up more than the threshold apart', () => {
    // The design's proof case: anchor-to-first grouping would compare 2.6
    // against the group's FIRST member (0), see 2.6 > 2.5 and split off a
    // new one-item group whose centroid (2.6) sits only 1.4% from the first
    // group's centroid (1.2) — violating "adjacent groups > threshold
    // apart". Single-linkage compares 2.6 against the LAST appended member
    // (2.4, diff 0.2), so it correctly chains all three into one cluster.
    const items = [positioned(0, { id: 1 }), positioned(2.4, { id: 2 }), positioned(2.6, { id: 3 })]

    const groups = groupNearbyMarkers(items, 2.5)

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ type: 'cluster', left: (0 + 2.4 + 2.6) / 3 })
  })

  it('splits into two groups more than the threshold apart when a real gap exists', () => {
    const items = [
      positioned(0, { id: 1 }),
      positioned(1, { id: 2 }),
      positioned(2, { id: 3 }),
      positioned(20, { id: 4 }),
      positioned(21, { id: 5 })
    ]

    const groups = groupNearbyMarkers(items, 2.5)

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ type: 'cluster', left: 1 })
    expect(groups[1]).toMatchObject({ type: 'cluster', left: 20.5 })
    expect(groups[1]!.left - groups[0]!.left).toBeGreaterThan(2.5)
  })
})

describe('layoutPeriodMarkers', () => {
  const scale = { from: '2026-08-01', to: '2026-10-01' }
  const today = new Date(2026, 8, 1)

  it('filters to the given periodId, excluding markers from other periods', () => {
    const own = marker({ id: 1, periodId: 100, date: '2026-09-10' })
    const other = marker({ id: 2, periodId: 200, date: '2026-09-10' })

    const groups = layoutPeriodMarkers([own, other], 100, scale, today)

    expect(groups).toEqual([{ type: 'single', left: expect.any(Number), marker: own }])
  })

  it('drops a marker whose date is before today via isUpcomingMarker', () => {
    const past = marker({ id: 1, periodId: 100, date: '2026-08-31' })
    const upcoming = marker({ id: 2, periodId: 100, date: '2026-09-10' })

    const groups = layoutPeriodMarkers([past, upcoming], 100, scale, today)

    expect(groups).toEqual([{ type: 'single', left: expect.any(Number), marker: upcoming }])
  })

  it('positions with clampedMarkerPosition, then sorts and groups the result', () => {
    const nearby = marker({ id: 1, periodId: 100, date: '2026-09-10', kind: 'parcial' })
    const alsoNearby = marker({ id: 2, periodId: 100, date: '2026-09-10', kind: 'final' })

    const groups = layoutPeriodMarkers([nearby, alsoNearby], 100, scale, today)

    expect(groups).toEqual([{ type: 'cluster', left: expect.any(Number), markers: [nearby, alsoNearby] }])
  })
})
