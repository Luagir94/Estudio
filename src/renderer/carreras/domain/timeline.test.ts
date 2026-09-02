import { describe, expect, it } from 'vitest'
import { barPosition, clampedMarkerPosition, markerPosition, timelineScale } from './timeline'

const cuatri1 = { startsOn: '2026-03-09', endsOn: '2026-07-18' }
const cuatri2 = { startsOn: '2026-08-12', endsOn: '2026-12-04' }
const anual = { startsOn: '2026-03-09', endsOn: '2026-11-20' }
const today = new Date(2026, 7, 15)

describe('timelineScale', () => {
  it('has nothing to scale without periods', () => {
    expect(timelineScale([], today)).toBeNull()
  })

  it('spans from the earliest start to the latest end', () => {
    const scale = timelineScale([cuatri2, cuatri1], today)

    expect(scale).toEqual({ from: '2026-03-09', to: '2026-12-04' })
  })

  it('stretches to today when every period already ended', () => {
    const scale = timelineScale([{ startsOn: '2025-03-09', endsOn: '2025-07-18' }], today)

    expect(scale?.to).toBe('2026-08-15')
  })

  it('stretches past an open-ended period so its bar has somewhere to run', () => {
    const scale = timelineScale([{ startsOn: '2024-03-04', endsOn: null }], today)

    expect(scale).toEqual({ from: '2024-03-04', to: '2026-08-15' })
  })

  it('never collapses to a zero-width range', () => {
    const scale = timelineScale([{ startsOn: '2026-08-15', endsOn: null }], today)

    expect(scale?.from).not.toBe(scale?.to)
  })
})

describe('barPosition', () => {
  const scale = { from: '2026-03-09', to: '2026-12-04' }

  it('starts a bar at the left edge when it opens the range', () => {
    expect(barPosition(cuatri1, scale).left).toBe(0)
  })

  it('ends a bar at the right edge when it closes the range', () => {
    const { left, width } = barPosition(cuatri2, scale)

    expect(left + width).toBeCloseTo(100, 5)
  })

  it('gives an overlapping period a bar that covers both cuatrimestres', () => {
    const anualBar = barPosition(anual, scale)
    const firstBar = barPosition(cuatri1, scale)

    expect(anualBar.left).toBe(firstBar.left)
    expect(anualBar.width).toBeGreaterThan(firstBar.width)
  })

  it('runs an open-ended bar to the right edge of the range', () => {
    const { left, width } = barPosition({ startsOn: '2026-08-12', endsOn: null }, scale)

    expect(left + width).toBeCloseTo(100, 5)
  })

  it('clamps a period that starts before the range', () => {
    const { left, width } = barPosition({ startsOn: '2025-01-01', endsOn: '2026-04-01' }, scale)

    expect(left).toBe(0)
    expect(width).toBeGreaterThan(0)
  })
})

describe('markerPosition', () => {
  const scale = { from: '2026-03-09', to: '2026-12-04' }

  it('places today inside the range', () => {
    const position = markerPosition(today, scale)

    expect(position).toBeGreaterThan(0)
    expect(position).toBeLessThan(100)
  })

  it('reports nothing when today falls outside the range', () => {
    expect(markerPosition(new Date(2027, 5, 1), scale)).toBeNull()
    expect(markerPosition(new Date(2025, 5, 1), scale)).toBeNull()
  })
})

describe('clampedMarkerPosition', () => {
  const scale = { from: '2026-03-09', to: '2026-12-04' }

  it('positions an in-window date exactly, matching markerPosition', () => {
    expect(clampedMarkerPosition('2026-08-15', scale)).toBeCloseTo(markerPosition(today, scale)!, 5)
  })

  it('clamps a before-window date to 0 instead of dropping it', () => {
    expect(clampedMarkerPosition('2025-01-01', scale)).toBe(0)
  })

  it('clamps an after-window date to 100 instead of dropping it', () => {
    expect(clampedMarkerPosition('2027-06-01', scale)).toBe(100)
  })

  it('places both boundary dates exactly at the edges', () => {
    expect(clampedMarkerPosition(scale.from, scale)).toBe(0)
    expect(clampedMarkerPosition(scale.to, scale)).toBe(100)
  })
})
