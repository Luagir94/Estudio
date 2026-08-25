import { differenceInCalendarDays, parseISO } from 'date-fns'
import i18n from '../../i18n'
import {
  classifyDeadline,
  classifyUrgency,
  type DeadlineBucket,
  type DeadlineUrgency
} from '../../entregas/domain/deadline'

// Pure, framework-free domain module (design §4). MUST NOT import electron
// or better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule.
//
// An administrative date is a trámite owned by a carrera: an inscription
// window, a regularidad expiry, a piece of paperwork. Two things separate it
// from a Deadline, and everything below follows from them:
//
//   1. It has NO completion. There is no `done` to check first, which is why
//      the COMPLETADAS bucket is unreachable here by construction rather than
//      by a filter someone could forget.
//   2. It may be a WINDOW, not a moment. What matters for urgency is when it
//      CLOSES — so the relevant date is `endsOn ?? startsOn`, and every
//      question below is asked of that one date.
//
// The urgency vocabulary itself is NOT re-derived: `classifyUrgency` and
// `classifyDeadline` are the entregas domain's, applied to the relevant date,
// so a trámite and an entrega closing on the same day always read the same.

export interface AcademicDateInterval {
  startsOn: string
  /** `null` = a single-day date, not a window. */
  endsOn: string | null
}

/**
 * The date this trámite is actually judged by: the end of a window (what
 * closes), or the day itself when there is no window.
 *
 * Everything downstream — urgency, "is it past", which group it lands in —
 * asks this and only this, so a window that has opened but not closed still
 * reads as pending rather than as history.
 */
export function relevantAcademicDate(academicDate: AcademicDateInterval): string {
  return academicDate.endsOn ?? academicDate.startsOn
}

/** Whether the date spans days (an inscription window) or is one day. */
export function isAcademicDateWindow(academicDate: AcademicDateInterval): boolean {
  return academicDate.endsOn !== null
}

/**
 * Whole CALENDAR days from `now` to the relevant date — never elapsed hours,
 * so the answer does not flip with the time of day (same rule as
 * `entregas/domain/deadline.ts`'s `daysRemaining`). `parseISO` on an
 * offset-free string yields a LOCAL date, matching the storage convention.
 */
export function daysUntilAcademicDate(academicDate: AcademicDateInterval, now: Date): number {
  return differenceInCalendarDays(parseISO(relevantAcademicDate(academicDate)), now)
}

/**
 * Whether the date is over. The CLOSING DAY ITSELF IS NOT PAST — a window
 * that closes today is a window you can still act on, and the whole point of
 * surfacing these is to catch them before they shut.
 */
export function isPastAcademicDate(academicDate: AcademicDateInterval, now: Date): boolean {
  return daysUntilAcademicDate(academicDate, now) < 0
}

/**
 * The four-level urgency the deadline pills already grade by, applied to the
 * relevant date. Reused rather than re-derived so one vocabulary describes
 * both kinds of pressure.
 */
export function classifyAcademicDateUrgency(academicDate: AcademicDateInterval, now: Date): DeadlineUrgency {
  return classifyUrgency(relevantAcademicDate(academicDate), now)
}

/**
 * The Entregas bucket this date belongs to.
 *
 * `done` is passed as `false` because it always is: an administrative date
 * has none. That is what makes COMPLETADAS unreachable here — not a rule
 * applied at the call site, but the shape of the data.
 */
export function classifyAcademicDate(academicDate: AcademicDateInterval, now: Date): DeadlineBucket {
  return classifyDeadline(relevantAcademicDate(academicDate), false, now)
}

/**
 * Every date still ahead, soonest first. Past dates are DROPPED rather than
 * bucketed as overdue: an entrega you missed is still owed, a closed
 * inscription window is not — there is nothing left to do about it, so
 * nagging would be noise (the carrera's own card keeps it visible as record).
 */
export function listUpcomingAcademicDates<T extends AcademicDateInterval>(academicDates: T[], now: Date): T[] {
  return academicDates
    .filter((academicDate) => !isPastAcademicDate(academicDate, now))
    .sort((a, b) => relevantAcademicDate(a).localeCompare(relevantAcademicDate(b)))
}

/** The horizon Hoy's callout warns inside, in days. */
export const ACADEMIC_DATE_CALLOUT_HORIZON_DAYS = 7

/**
 * The one date Hoy warns about: the nearest one closing inside the horizon,
 * or `null` when nothing is near. One warning, never a list — Hoy is a
 * read-model, and a second callout would be a second thing to ignore.
 */
export function pickImminentAcademicDate<T extends AcademicDateInterval>(
  academicDates: T[],
  now: Date,
  withinDays: number = ACADEMIC_DATE_CALLOUT_HORIZON_DAYS
): T | null {
  return (
    listUpcomingAcademicDates(academicDates, now).find(
      (academicDate) => daysUntilAcademicDate(academicDate, now) <= withinDays
    ) ?? null
  )
}

/**
 * The four Entregas buckets, keyed the same way `GroupedDeadlines` is —
 * declared here rather than reused because that type constrains its member to
 * `DeadlineLike` (a `dueAt` and a `done`), and an administrative date has
 * neither. Same keys, different inhabitants.
 */
export type GroupedAcademicDates<T> = Record<DeadlineBucket, T[]>

/**
 * Groups upcoming dates into the SAME four buckets the Entregas screen
 * renders, sorted by relevant date within each. `atrasadas` and `completadas`
 * always come back empty — past dates never enter (see
 * `listUpcomingAcademicDates`) and completion does not exist — but the full
 * record is returned so callers can merge it with `groupDeadlines` without
 * special-casing a narrower shape.
 */
export function groupAcademicDates<T extends AcademicDateInterval>(
  academicDates: T[],
  now: Date
): GroupedAcademicDates<T> {
  const groups: GroupedAcademicDates<T> = { atrasadas: [], proximos7: [], masAdelante: [], completadas: [] }
  for (const academicDate of listUpcomingAcademicDates(academicDates, now)) {
    groups[classifyAcademicDate(academicDate, now)].push(academicDate)
  }
  return groups
}

// --- formatting -----------------------------------------------------------

// The month tables live in the app's OWN locale resources
// (`common:monthsCaps` / `common:monthsLong`) rather than a date-fns locale
// import: this copy is design-fixed, so it must not shift under a locale-data
// update. Same rule as `carreras/domain/period.ts`'s `formatDay`.
interface ParsedDay {
  /** Day of month with no leading zero — "1 – 5 DIC", not "01 – 05 DIC". */
  day: string
  monthIndex: number
}

function parseDay(date: string): ParsedDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) {
    return null
  }
  const monthIndex = Number(match[2]) - 1
  if (monthIndex < 0 || monthIndex > 11) {
    return null
  }
  return { day: String(Number(match[3])), monthIndex }
}

function monthTable(key: 'monthsCaps' | 'monthsLong'): string[] | null {
  const months: unknown = i18n.t(`common:${key}`, { returnObjects: true })
  return Array.isArray(months) ? (months as string[]) : null
}

// Malformed dates come back UNFORMATTED — showing the raw stored string beats
// interpolating "undefined" into the card (same convention as
// `finales/domain/finalDate.ts`'s `formatTakenOn`).
function rawRange(startsOn: string, endsOn: string | null): string {
  return endsOn === null ? startsOn : `${startsOn} – ${endsOn}`
}

/**
 * The carrera card's date display: "1 – 5 DIC" for a same-month window,
 * "28 NOV – 5 DIC" when it crosses a month, "20 DIC" for a single day.
 *
 * The year is deliberately absent — the card lists a carrera's own calendar,
 * where the month is enough to place a date, and four extra characters on
 * every row would crowd a 336px rail.
 */
export function formatAcademicDateRange(startsOn: string, endsOn: string | null): string {
  const months = monthTable('monthsCaps')
  const start = parseDay(startsOn)
  if (months === null || start === null) {
    return rawRange(startsOn, endsOn)
  }
  const startMonth = months[start.monthIndex]
  if (typeof startMonth !== 'string') {
    return rawRange(startsOn, endsOn)
  }
  if (endsOn === null) {
    return `${start.day} ${startMonth}`
  }
  const end = parseDay(endsOn)
  const endMonth = end === null ? undefined : months[end.monthIndex]
  if (end === null || typeof endMonth !== 'string') {
    return rawRange(startsOn, endsOn)
  }
  return start.monthIndex === end.monthIndex
    ? `${start.day} – ${end.day} ${endMonth}`
    : `${start.day} ${startMonth} – ${end.day} ${endMonth}`
}

/**
 * The long form the Hoy callout reads with: "Del 1 al 5 de diciembre",
 * "Del 28 de noviembre al 5 de diciembre", "El 20 de diciembre". A full
 * sentence fragment, because the callout is prose, not a chip.
 */
export function formatAcademicDateLongRange(startsOn: string, endsOn: string | null): string {
  const months = monthTable('monthsLong')
  const start = parseDay(startsOn)
  if (months === null || start === null) {
    return rawRange(startsOn, endsOn)
  }
  const startMonth = months[start.monthIndex]
  if (typeof startMonth !== 'string') {
    return rawRange(startsOn, endsOn)
  }
  if (endsOn === null) {
    return i18n.t('fechas:longRange.singleDay', { day: start.day, month: startMonth })
  }
  const end = parseDay(endsOn)
  const endMonth = end === null ? undefined : months[end.monthIndex]
  if (end === null || typeof endMonth !== 'string') {
    return rawRange(startsOn, endsOn)
  }
  return start.monthIndex === end.monthIndex
    ? i18n.t('fechas:longRange.sameMonth', { startDay: start.day, endDay: end.day, month: endMonth })
    : i18n.t('fechas:longRange.crossMonth', {
        startDay: start.day,
        startMonth,
        endDay: end.day,
        endMonth
      })
}

// One shape, two casings: the pill is a label ("Cierra en 3 días") and the
// callout headline is mid-sentence ("Inscripción a finales — cierra en 3
// días"). Lowercasing the translated pill would be a guess about Spanish
// capitalisation rules applied to app copy; two key groups keep both under
// the translator's control.
function statusKey(academicDate: AcademicDateInterval, now: Date): { key: string; values: Record<string, number> } {
  const days = daysUntilAcademicDate(academicDate, now)
  const closes = isAcademicDateWindow(academicDate)
  if (days <= 0) {
    return { key: closes ? 'closesToday' : 'today', values: {} }
  }
  if (days === 1) {
    return { key: closes ? 'closesTomorrow' : 'tomorrow', values: {} }
  }
  if (days < 14) {
    return { key: closes ? 'closesInDays' : 'inDays', values: { days } }
  }
  return { key: closes ? 'closesInWeeks' : 'inWeeks', values: { weeks: Math.round(days / 7) } }
}

/**
 * Status-pill copy. A WINDOW says what happens — "Cierra en 3 días" — because
 * that is the fact the reader needs; a single-day date falls back to the same
 * relative copy every deadline pill uses.
 */
export function formatAcademicDateStatus(academicDate: AcademicDateInterval, now: Date): string {
  const { key, values } = statusKey(academicDate, now)
  return i18n.t(`fechas:status.${key}`, values)
}

/** Same status, lowercased for the middle of a sentence (Hoy's callout headline). */
export function formatAcademicDateStatusInline(academicDate: AcademicDateInterval, now: Date): string {
  const { key, values } = statusKey(academicDate, now)
  return i18n.t(`fechas:statusInline.${key}`, values)
}
