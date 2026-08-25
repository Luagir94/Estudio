// Pure, framework-free domain module (design §4, §3a; spec: "daily-dashboard").
// MUST NOT import electron or better-sqlite3 — enforced by
// tooling/dependencyGuard.mts's no-electron-or-sqlite-in-domain rule. Composes
// the Hoy read-model from EXISTING subjects/slots/deadlines data — zero new
// persisted fields (spec: "Hoy MUST be a pure read-model introducing no new
// persisted data"). Reuses `entregas/domain/deadline.ts`'s `classifyDeadline`
// and `shared/domain/dayOfWeek.ts`'s Monday-first mapping instead of
// re-deriving either (same precedent as `horario/domain/weekProjection.ts`).
import { addDays, isSameDay, parseISO, startOfWeek } from 'date-fns'
import type { AttendanceRecord, AttendanceStatus, ClassNoteRecord } from '../../../shared/ipc/materias'
import { findAttendanceStatus, findClassNote } from '../../clases/domain/classOccurrence'
import { classifyDeadline } from '../../entregas/domain/deadline'
import { fromMondayFirstIndex } from '../../shared/domain/dayOfWeek'

export interface DashboardSlot {
  id: number
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
  location: string | null
}

export interface DashboardSubject {
  id: number
  name: string
  color: string
  slots: DashboardSlot[]
}

export interface DashboardDeadline {
  id: number
  subjectId: number
  subjectName: string
  subjectColor: string
  title: string
  type: string
  dueAt: string
  done: boolean
}

export interface TodayClass {
  subjectId: number
  subjectName: string
  subjectColor: string
  slotId: number
  startMinutes: number
  endMinutes: number
  location: string | null
}

/**
 * Every slot occurring on `now`'s stored `dayOfWeek`, sorted ascending by
 * start time (spec: "Today view on launch"). `dayOfWeek` is stored
 * Sunday-based (0=Sunday..6=Saturday, schema.ts), matching `Date.getDay()`
 * directly — no Monday-first translation needed for a same-day filter.
 */
export function getTodayClasses(subjects: DashboardSubject[], now: Date): TodayClass[] {
  const todayDayOfWeek = now.getDay()
  return subjects
    .flatMap((subject) =>
      subject.slots
        .filter((slot) => slot.dayOfWeek === todayDayOfWeek)
        .map((slot) => ({
          subjectId: subject.id,
          subjectName: subject.name,
          subjectColor: subject.color,
          slotId: slot.id,
          startMinutes: slot.startMinutes,
          endMinutes: slot.endMinutes,
          location: slot.location
        }))
    )
    .sort((a, b) => a.startMinutes - b.startMinutes)
}

export interface TodayClassWithMarks extends TodayClass {
  /** `null` = UNMARKED, which is the absence of a stored row and not a fourth status. */
  attendanceStatus: AttendanceStatus | null
  hasNote: boolean
}

/**
 * Joins the day's classes to what has been recorded about them.
 *
 * The join key is `(subjectId, date)` — never the slot id — because that is
 * what a mark and an apunte are anchored by: the weekly pattern has no
 * independent lifecycle, so anything keyed on a slot would be lost the next
 * time the horario was edited (see `attendance_records` in db/schema.ts).
 *
 * `date` is the caller's LOCAL calendar day, passed in rather than read off a
 * clock here: this stays a pure function, and Hoy's "now" is already injected
 * at the top of the screen for exactly this reason.
 *
 * Two classes of the same subject on the same day therefore share one mark and
 * one apunte, which is the intended reading of the anchor, not a collision.
 */
export function withClassMarks(
  todayClasses: TodayClass[],
  attendance: AttendanceRecord[],
  classNotes: ClassNoteRecord[],
  date: string
): TodayClassWithMarks[] {
  return todayClasses.map((classItem) => ({
    ...classItem,
    attendanceStatus: findAttendanceStatus(attendance, classItem.subjectId, date),
    hasNote: findClassNote(classNotes, classItem.subjectId, date) !== null
  }))
}

export interface NextClassHighlight {
  slotId: number
  /** Positive: starts in that many minutes. Zero or negative: in progress right now ("AHORA"). */
  minutesUntilStart: number
}

/**
 * Which of today's classes deserves the "next class" accent, under the
 * IN-PROGRESS-FIRST rule (disclosed judgment call — the design allowed
 * either): a class currently running (start <= now < end) is highlighted as
 * "AHORA"; otherwise the first class whose start is still in the future.
 * After the last class ends (its `endMinutes` is exclusive, like the rule
 * above) — or with no classes at all — nothing is highlighted.
 *
 * `now` is compared through its LOCAL wall-clock minutes (design §3a "the
 * DST rule" — never ms-since-epoch arithmetic), the same unit slots store.
 * Expects `todayClasses` sorted ascending by start time, as
 * {@link getTodayClasses} returns them.
 */
export function getNextClassHighlight(todayClasses: TodayClass[], now: Date): NextClassHighlight | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const highlighted = todayClasses.find(
    (classItem) =>
      (classItem.startMinutes <= nowMinutes && nowMinutes < classItem.endMinutes) || classItem.startMinutes > nowMinutes
  )
  return highlighted ? { slotId: highlighted.slotId, minutesUntilStart: highlighted.startMinutes - nowMinutes } : null
}

export interface NextClassOccurrence {
  /** How many days after `now` the class occurs: 1..7 — "next" starts tomorrow, never today. */
  daysAhead: number
  /** Stored Sunday-based day (0=Sunday..6=Saturday), same unit the slots carry. */
  dayOfWeek: number
  startMinutes: number
  subjectName: string
}

/**
 * The next class occurrence across the WEEKLY pattern (Hoy's designed empty
 * state: "La próxima es el lunes · 08:00 · ..."). Scans tomorrow through 7
 * days ahead — the whole recurring week — and answers with the earliest slot
 * of the nearest day that has one. Deliberately never answers with a class
 * today: the empty state only renders when today's list is empty, and a
 * general "next" that could point at today would contradict the very state
 * asking for it. `null` means no subject has any slot at all.
 */
export function getNextClassOccurrence(subjects: DashboardSubject[], now: Date): NextClassOccurrence | null {
  for (let daysAhead = 1; daysAhead <= 7; daysAhead += 1) {
    const dayOfWeek = (now.getDay() + daysAhead) % 7
    const first = subjects
      .flatMap((subject) =>
        subject.slots
          .filter((slot) => slot.dayOfWeek === dayOfWeek)
          .map((slot) => ({ startMinutes: slot.startMinutes, subjectName: subject.name }))
      )
      .sort((a, b) => a.startMinutes - b.startMinutes)[0]
    if (first) {
      return { daysAhead, dayOfWeek, startMinutes: first.startMinutes, subjectName: first.subjectName }
    }
  }
  return null
}

export interface FreeBlock {
  gapMinutes: number
  afterSubjectName: string
  beforeSubjectName: string
}

/**
 * Only a gap this long (or longer) between two consecutive classes on the
 * SAME day is worth surfacing as a "free block" (design node `NBahI`'s
 * single example: a 30-minute gap between two other classes the same day is
 * NOT shown, only the 6h30m gap is) — inferred threshold, not sourced from
 * spec/design text, disclosed as a judgment call (same precedent as slice
 * 4's TIPO option-set inference).
 */
export const FREE_BLOCK_THRESHOLD_MINUTES = 120

/** Gaps of at least {@link FREE_BLOCK_THRESHOLD_MINUTES} between `todayClasses` (already sorted by start time). */
export function getFreeBlocks(
  todayClasses: TodayClass[],
  thresholdMinutes = FREE_BLOCK_THRESHOLD_MINUTES
): FreeBlock[] {
  const blocks: FreeBlock[] = []
  for (let index = 0; index < todayClasses.length - 1; index += 1) {
    const current = todayClasses[index]!
    const next = todayClasses[index + 1]!
    const gapMinutes = next.startMinutes - current.endMinutes
    if (gapMinutes >= thresholdMinutes) {
      blocks.push({ gapMinutes, afterSubjectName: current.subjectName, beforeSubjectName: next.subjectName })
    }
  }
  return blocks
}

/**
 * Overdue + due-within-7-days deadlines, sorted ascending by fecha límite
 * (spec: "Overdue Surfacing" — overdue deadlines MUST be surfaced on Hoy,
 * not only in Entregas' ATRASADAS group; matches the `.pen` design's single
 * "PRÓXIMOS 7 DÍAS" list, node `AKq7v`, which itself contains an overdue
 * example row styled with the urgent status pill — disclosed judgment call:
 * the design does not draw a visually SEPARATE "overdue" section, it
 * surfaces overdue items within this one list, distinguished by color).
 * Reuses `entregas/domain/deadline.ts`'s `classifyDeadline`, never
 * re-derives the bucket boundaries locally.
 */
export function getDashboardDeadlines(deadlines: DashboardDeadline[], now: Date): DashboardDeadline[] {
  return deadlines
    .filter((deadline) => {
      const bucket = classifyDeadline(deadline.dueAt, deadline.done, now)
      return bucket === 'atrasadas' || bucket === 'proximos7'
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
}

export interface WeekStripDay {
  /** Monday-first display index: 0=Monday..6=Sunday. */
  mondayFirstIndex: number
  date: Date
  /** One entry per class that day, in start-time order — color used to render the day's "class bars". */
  classColors: string[]
  /** Count of PENDING deadlines due that calendar day (design node `eHE58` "Due Marker"). */
  dueCount: number
}

/**
 * 7-day "ESTA SEMANA" strip, Monday-start (spec: "Week Strip Starts Monday").
 * Built from a LOCAL calendar date (`startOfWeek`/`addDays`, design §3a "the
 * DST rule") — never a fixed 24h/ms multiple.
 */
export function getWeekStrip(subjects: DashboardSubject[], deadlines: DashboardDeadline[], now: Date): WeekStripDay[] {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })

  return Array.from({ length: 7 }, (_unused, mondayFirstIndex) => {
    const date = addDays(weekStart, mondayFirstIndex)
    const dayOfWeek = fromMondayFirstIndex(mondayFirstIndex)

    const classColors = subjects
      .flatMap((subject) =>
        subject.slots.filter((slot) => slot.dayOfWeek === dayOfWeek).map((slot) => ({ slot, subject }))
      )
      .sort((a, b) => a.slot.startMinutes - b.slot.startMinutes)
      .map(({ subject }) => subject.color)

    const dueCount = deadlines.filter((deadline) => !deadline.done && isSameDay(parseISO(deadline.dueAt), date)).length

    return { mondayFirstIndex, date, classColors, dueCount }
  })
}
