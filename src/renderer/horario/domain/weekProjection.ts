import { addDays, set, startOfDay } from 'date-fns'
import { fromMondayFirstIndex, toMondayFirstIndex } from '../../shared/domain/dayOfWeek'

// Pure, framework-free domain module (design §4, §3a; spec: "Read-Only
// Schedule Projection"). MUST NOT import electron or better-sqlite3 —
// enforced by tooling/dependencyGuard.mts's no-electron-or-sqlite-in-domain
// rule. Groups/orders a subject's schedule slots for the Monday-first
// Horario grid. Reuses `shared/domain/dayOfWeek.ts`'s
// `toMondayFirstIndex`/`fromMondayFirstIndex` (gate-findings/slice-2a,
// Finding 2) instead of re-deriving the Sunday-based -> Monday-first
// mapping locally.

export interface WeekProjectionSlot {
  subjectId: number
  subjectName: string
  subjectColor: string
  slotId: number
  /** Stored Sunday-based `dayOfWeek` — 0=Sunday..6=Saturday (schema.ts). */
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
  location: string | null
}

export interface WeekProjectionSubject {
  id: number
  name: string
  color: string
  slots: Array<{
    id: number
    dayOfWeek: number
    startMinutes: number
    endMinutes: number
    location: string | null
  }>
}

export interface WeekDayColumn {
  /** Monday-first display index: 0=Monday..6=Sunday. */
  mondayFirstIndex: number
  /** Stored Sunday-based `dayOfWeek` this column corresponds to. */
  dayOfWeek: number
  /** Slots for this day, sorted ascending by `startMinutes`. */
  slots: WeekProjectionSlot[]
}

/**
 * Groups every slot from every subject by day, Monday-first, and orders
 * each day's slots by start time (spec: "Horario MUST be a read-only
 * projection over subjects' schedule slots"). Always returns exactly 7
 * columns (Monday..Sunday) even when a day has no slots, so callers can
 * render a stable grid.
 */
export function projectWeek(subjects: WeekProjectionSubject[]): WeekDayColumn[] {
  const flatSlots: WeekProjectionSlot[] = subjects.flatMap((subject) =>
    subject.slots.map((slot) => ({
      subjectId: subject.id,
      subjectName: subject.name,
      subjectColor: subject.color,
      slotId: slot.id,
      dayOfWeek: slot.dayOfWeek,
      startMinutes: slot.startMinutes,
      endMinutes: slot.endMinutes,
      location: slot.location
    }))
  )

  return Array.from({ length: 7 }, (_unused, mondayFirstIndex) => {
    const dayOfWeek = fromMondayFirstIndex(mondayFirstIndex)
    const slots = flatSlots
      .filter((slot) => slot.dayOfWeek === dayOfWeek)
      .sort((a, b) => a.startMinutes - b.startMinutes)
    return { mondayFirstIndex, dayOfWeek, slots }
  })
}

/**
 * Whether either weekend day carries at least one class. When BOTH are empty
 * the grid collapses the Sábado/Domingo columns to narrow, dimmed tracks;
 * one weekend class anywhere restores the full seven-column layout.
 * `dayOfWeek` is the STORED Sunday-based value (0=Sunday, 6=Saturday,
 * schema.ts), so this works on any `WeekDayColumn[]` regardless of order.
 */
export function hasWeekendClasses(columns: WeekDayColumn[]): boolean {
  return columns.some((column) => (column.dayOfWeek === 0 || column.dayOfWeek === 6) && column.slots.length > 0)
}

/**
 * Where "now" sits inside the grid's visible time range, as a 0..1 fraction
 * of `[gridStartMinutes, gridEndMinutes)` — the SAME minutes-of-day scale
 * class blocks are positioned on (HorarioGrid's `percentOf`), so the "now"
 * line and the blocks can never drift apart. Returns null outside the range
 * (the end is exclusive: a cut-off the clock can reach shows no line at the
 * very bottom edge). Reads LOCAL wall-clock minutes (design §3a "the DST
 * rule"), the unit slots store.
 */
export function getNowOffsetFraction(now: Date, gridStartMinutes: number, gridEndMinutes: number): number | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  if (nowMinutes < gridStartMinutes || nowMinutes >= gridEndMinutes) {
    return null
  }
  return (nowMinutes - gridStartMinutes) / (gridEndMinutes - gridStartMinutes)
}

/**
 * Composes the concrete Date a slot occurs at within the week anchored by
 * `weekStart` (expected to be that week's Monday). Built from a LOCAL
 * calendar date (`startOfDay`/`addDays`, which operate on calendar days,
 * not fixed 24h/ms multiples) with the slot's stored minutes applied via
 * `set` — this is what keeps the result DST-safe (design §3a "the DST
 * rule"; spec: "DST-Safe Class Occurrence Rendering" — never adding fixed
 * 24h multiples or UTC offsets).
 */
export function getWeekOccurrenceDate(weekStart: Date, dayOfWeek: number, startMinutes: number): Date {
  const mondayFirstIndex = toMondayFirstIndex(dayOfWeek)
  const day = addDays(startOfDay(weekStart), mondayFirstIndex)
  return set(day, {
    hours: Math.floor(startMinutes / 60),
    minutes: startMinutes % 60,
    seconds: 0,
    milliseconds: 0
  })
}
