import { differenceInCalendarDays, parseISO } from 'date-fns'
import { z } from 'zod'
import i18n from '../../i18n'

// Pure, framework-free domain module (design §4). MUST NOT import electron
// or better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule (see tooling/dependencyGuard.test.ts).
//
// A Period is nothing but a NAMED INTERVAL owned by a Program (design node
// `t6hSrU` — "Carreras y períodos"). `kind` ("cuatrimestre", "curso",
// "anual", …) is a LABEL, never a rule: it does not imply, constrain or
// derive any date. Two institutions can therefore both have a "1er
// Cuatrimestre 2026" starting on different days without the model needing to
// know anything about either of them.

// Periods are CALENDAR DATES, `YYYY-MM-DD` — no time, no offset. Deadlines
// carry a time (see entregas/domain/deadline.ts) because a due moment
// matters; a period boundary is a whole day, so accepting a datetime here
// would invent a precision the domain does not have.
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a calendar date (YYYY-MM-DD)')

export const periodSchema = z
  .object({
    programId: z.number().int(),
    name: z.string().trim().min(1, 'name is required'),
    // Free text on purpose: the institution names its own periods, and the
    // app must not hold an enum it would have to keep chasing.
    kind: z.string().trim().min(1, 'kind is required'),
    startsOn: localDateSchema,
    // NULL means the period has no end — "clases de inglés" that simply keep
    // going. The interval is then `[startsOn, ∞)`, which every function below
    // handles explicitly rather than by inventing a far-future sentinel date
    // that would leak into the UI as a real end date.
    endsOn: localDateSchema.nullable().default(null)
  })
  .refine((period) => period.endsOn === null || period.endsOn > period.startsOn, {
    message: 'endsOn must be after startsOn',
    path: ['endsOn']
  })

export type PeriodInput = z.infer<typeof periodSchema>

/** Minimal, zod-version-agnostic issue shape — only what callers need. */
export interface PeriodValidationIssue {
  path: PropertyKey[]
  message: string
}

export type PeriodValidationResult = { ok: true; period: PeriodInput } | { ok: false; errors: PeriodValidationIssue[] }

/**
 * Validates a raw payload against the Period entity shape. Pure function:
 * no side effects, no I/O.
 */
export function createPeriod(input: unknown): PeriodValidationResult {
  const result = periodSchema.safeParse(input)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
    }
  }
  return { ok: true, period: result.data }
}

/**
 * The academic year is DERIVED from the start date — it is never stored.
 *
 * A stored year would be a second source of truth for a fact the dates
 * already carry, free to drift out of sync with them. It also cannot survive
 * the real case that motivated this model: a course running from November
 * 2026 to March 2027 belongs to no single calendar year, so "year" can only
 * ever be a label (the cohort's starting year), never a container period
 * that the cuatrimestres would have to fit inside.
 */
export function derivePeriodYear(startsOn: string): number {
  return Number(startsOn.slice(0, 4))
}

export type PeriodStatus = 'proximo' | 'activo' | 'finalizado'

export interface PeriodInterval {
  startsOn: string
  /** `null` = open-ended: the period has begun and does not stop. */
  endsOn: string | null
}

/** Whether the period runs indefinitely (no end date was ever set). */
export function isOpenEnded(period: PeriodInterval): boolean {
  return period.endsOn === null
}

/**
 * Classifies a period against the clock. Both boundaries are INCLUSIVE: the
 * first and last day of a cuatrimestre are days you are cursando.
 *
 * An open-ended period is never `finalizado` — that is the whole point of
 * it, and it is what keeps its subjects out of the "sin cerrar" nagging
 * (see materias/domain/subjectStatus.ts).
 *
 * Comparison is in whole calendar days (`differenceInCalendarDays`, same
 * precedent as entregas/domain/deadline.ts) so the answer does not flip with
 * the time of day. `parseISO` on an offset-free string yields a LOCAL date,
 * matching the naive-local storage convention (design §3a).
 */
export function periodStatus(period: PeriodInterval, today: Date): PeriodStatus {
  if (differenceInCalendarDays(parseISO(period.startsOn), today) > 0) {
    return 'proximo'
  }
  if (period.endsOn !== null && differenceInCalendarDays(parseISO(period.endsOn), today) < 0) {
    return 'finalizado'
  }
  return 'activo'
}

/**
 * Whether two periods share at least one day.
 *
 * Overlap is EXPECTED, not an error: an "Anual 2026" period deliberately
 * spans both cuatrimestres so an annual subject can live in its own period
 * instead of needing a subject↔period join table (design node `XIpwp` —
 * the "Se solapa con…" notice). Callers use this to inform, never to reject.
 *
 * ISO dates compare correctly as strings — lexicographic order is
 * chronological order — so no parsing is needed here. An open-ended period
 * is treated as ending at infinity, which is only ever a LOCAL comparison
 * value: it is never stored, formatted or shown.
 */
export function periodsOverlap(a: PeriodInterval, b: PeriodInterval): boolean {
  const endOf = (period: PeriodInterval): string => period.endsOn ?? '9999-12-31'
  return a.startsOn <= endOf(b) && b.startsOn <= endOf(a)
}

export interface IdentifiedPeriod extends PeriodInterval {
  id: number
}

/**
 * The period a new subject most likely belongs to, used to pre-select the
 * período picker.
 *
 * Only ACTIVE periods are candidates — you do not add a subject to a
 * cuatrimestre that already ended, and one that has not started yet is a
 * guess about the future.
 *
 * When several are active at once (which the model allows on purpose — an
 * "Anual 2026" runs alongside both cuatrimestres) the tie-breaks are:
 *   1. the one that started LAST, because it is the one you most recently
 *      set up;
 *   2. among those, the one that ends SOONEST, because a cuatrimestre
 *      starting the same day as the anual is the more specific answer. An
 *      open-ended period never wins this — "clases de inglés" should not
 *      hijack a subject you are adding to a carrera.
 *
 * Returns `null` when nothing is active, which leaves the picker on "Sin
 * período" rather than inventing an answer.
 */
export function pickDefaultPeriodId(periods: IdentifiedPeriod[], today: Date): number | null {
  const active = periods.filter((period) => periodStatus(period, today) === 'activo')
  if (active.length === 0) {
    return null
  }

  const best = active.reduce((winner, candidate) => {
    if (candidate.startsOn !== winner.startsOn) {
      return candidate.startsOn > winner.startsOn ? candidate : winner
    }
    // Same start date: prefer the one that finishes first. A null end is
    // infinity, so it always loses.
    const candidateEnd = candidate.endsOn ?? '9999-12-31'
    const winnerEnd = winner.endsOn ?? '9999-12-31'
    return candidateEnd < winnerEnd ? candidate : winner
  })

  return best.id
}

/**
 * The períodos running today, ordered for the "PERÍODO EN CURSO" card: the
 * one ending SOONEST first, because it is the most specific answer to "what
 * am I cursando right now" — an anual (or an open-ended period) frames the
 * year, it does not name the moment. An open-ended period therefore sorts
 * last, the same reason `pickDefaultPeriodId` never lets one win.
 *
 * Returns every active period, not one winner: the model allows several at
 * once on purpose (see activeTerms.ts), and the card names the companions
 * after the first.
 */
export function listCurrentPeriods<T extends PeriodInterval>(periods: T[], today: Date): T[] {
  return periods
    .filter((period) => periodStatus(period, today) === 'activo')
    .sort((a, b) => (a.endsOn ?? '9999-12-31').localeCompare(b.endsOn ?? '9999-12-31'))
}

/**
 * "14 ago" — day (leading zero kept) plus the app's own short month label.
 *
 * Exported because the APUNTES DE CLASE rows need exactly this format, and a
 * second implementation of it would be a second thing to keep in step (same
 * reuse rule `parciales` follows by borrowing `finales`' `formatTakenOn`).
 *
 * A malformed date — or a month index outside the catalog — comes back
 * UNFORMATTED, the repo-wide convention: showing the raw stored string beats
 * interpolating "undefined" into a chip.
 */
export function formatDay(date: string): string {
  const months: unknown = i18n.t('common:monthsShort', { returnObjects: true })
  const [, month, day] = date.split('-')
  if (!Array.isArray(months) || month === undefined || day === undefined) {
    return date
  }
  const monthLabel: unknown = months[Number(month) - 1]
  return typeof monthLabel === 'string' ? `${day} ${monthLabel}` : date
}

/**
 * Range copy for the period chips and timeline bars (design nodes `IA3bR`,
 * `RWARI`). The year is printed once when both ends share it, and on BOTH
 * ends when the period crosses the calendar year — the reader has to be able
 * to see that "03 nov 2026 – 15 mar 2027" is one period, not a typo.
 *
 * An open-ended period reads "Desde 04 mar 2024" — an open phrase, never a
 * range with a blank or a placeholder end.
 *
 * The month table lives in the app's own locale resources
 * (`common:monthsShort`) rather than a date-fns locale import: this copy is
 * design-fixed, so it must not shift under a locale-data update.
 */
export function formatPeriodRange(startsOn: string, endsOn: string | null): string {
  if (endsOn === null) {
    return i18n.t('carreras:periodRange.openStart', { date: formatDay(startsOn), year: startsOn.slice(0, 4) })
  }
  const startYear = startsOn.slice(0, 4)
  const endYear = endsOn.slice(0, 4)
  if (startYear === endYear) {
    return i18n.t('carreras:periodRange.sameYear', {
      start: formatDay(startsOn),
      end: formatDay(endsOn),
      year: endYear
    })
  }
  return i18n.t('carreras:periodRange.crossYear', {
    start: formatDay(startsOn),
    startYear,
    end: formatDay(endsOn),
    endYear
  })
}
