import { format } from 'date-fns'
import type { PeriodInterval } from './period'

// Pure, framework-free domain module (design §4). MUST NOT import electron
// or better-sqlite3 — enforced by .dependency-cruiser.cjs's
// no-electron-or-sqlite-in-domain rule.
//
// Layout maths for the period timeline (design node `OHnez`). It lives here,
// not in the component, because "does the Anual bar really span both
// cuatrimestres" is a claim worth asserting, and a percentage is far easier
// to assert than a rendered box.
//
// Positions come out as PERCENTAGES so the track can be fluid — the design
// fixed a 756px track only because Pencil has no percentage sizing.

export interface TimelineScale {
  /** Inclusive `YYYY-MM-DD` bounds of the drawn window. */
  from: string
  to: string
}

export interface BarPosition {
  /** Percentage from the left edge of the track. */
  left: number
  /** Percentage of the track width. */
  width: number
}

const MS_PER_DAY = 86_400_000

function toDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

/**
 * A LOCAL `Date` to its calendar day. `format` (not `toISOString`) on
 * purpose: `today` is a local wall-clock date, and reading it as UTC would
 * shift it a day in any timezone west of Greenwich.
 */
function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * The inverse of `toDayNumber`, which counts days in UTC — so this reads
 * them back in UTC too. Using `format` here instead would re-introduce the
 * local/UTC mismatch and land a day early.
 */
function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * The window the timeline draws.
 *
 * It always reaches at least today, for two reasons: a carrera whose periods
 * all ended would otherwise hide the "hoy" marker off the right edge, and an
 * open-ended period has no end to measure against — its bar runs to the edge
 * of whatever window we choose, so the window has to include the present for
 * that to read as "still going".
 *
 * Returns `null` when there is nothing to draw.
 */
export function timelineScale(periods: PeriodInterval[], today: Date): TimelineScale | null {
  if (periods.length === 0) {
    return null
  }

  const from = periods.reduce(
    (earliest, period) => (period.startsOn < earliest ? period.startsOn : earliest),
    periods[0].startsOn
  )

  const todayIso = toIsoDate(today)
  let to = todayIso
  for (const period of periods) {
    if (period.endsOn !== null && period.endsOn > to) {
      to = period.endsOn
    }
  }

  // A single-day window would make every width a division by zero. One day
  // of slack is enough and keeps the maths honest.
  if (to <= from) {
    to = fromDayNumber(toDayNumber(from) + 1)
  }

  return { from, to }
}

function span(scale: TimelineScale): number {
  return toDayNumber(scale.to) - toDayNumber(scale.from)
}

/**
 * Where a period's bar sits on the track, as `left`/`width` percentages.
 *
 * An open-ended period runs to the right edge — it has no end to place, and
 * stopping its bar short would draw an end date that does not exist. Periods
 * reaching outside the window are clamped rather than dropped, so a bar is
 * never invisible just because it started before the drawn range.
 */
export function barPosition(period: PeriodInterval, scale: TimelineScale): BarPosition {
  const total = span(scale)
  const fromDay = toDayNumber(scale.from)
  const start = clamp(toDayNumber(period.startsOn) - fromDay, 0, total)
  const end = period.endsOn === null ? total : clamp(toDayNumber(period.endsOn) - fromDay, 0, total)

  return {
    left: (start / total) * 100,
    width: (Math.max(end - start, 0) / total) * 100
  }
}

/**
 * Where the "hoy" marker sits, or `null` when today falls outside the drawn
 * window — better no marker than one pinned misleadingly to an edge.
 */
export function markerPosition(day: Date, scale: TimelineScale): number | null {
  const iso = toIsoDate(day)
  if (iso < scale.from || iso > scale.to) {
    return null
  }
  return ((toDayNumber(iso) - toDayNumber(scale.from)) / span(scale)) * 100
}
