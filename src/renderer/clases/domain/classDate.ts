// Pure, framework-free domain module (design §4). MUST NOT import electron
// or better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule.
//
// Both formats below read the app's OWN locale tables (`common:monthsShort`,
// `common:monthsLong`, `common:weekdaysLong`) rather than a date-fns locale
// import: this copy is design-fixed, so it must not shift under a locale-data
// update. Same rule `carreras/domain/period.ts` and
// `fechas/domain/academicDate.ts` already state.
//
// Malformed dates render UNFORMATTED — the raw stored string beats
// interpolating "undefined" into a header (same convention as
// `finales/domain/finalDate.ts`'s `formatTakenOn`).
import { parseISO } from 'date-fns'
import i18n from '../../i18n'
import { toMondayFirstIndex } from '../../shared/domain/dayOfWeek'

/**
 * The apuntes row's date cell: "14 ago".
 *
 * Re-exported rather than reimplemented — this is the SAME format the carrera
 * chips already use, and the year is absent for the same documented reason:
 * the list belongs to one cursada, where the month places a date well enough,
 * and a 70px cell has no room for four more characters.
 */
export { formatDay as formatClassDayMonth } from '../../carreras/domain/period'

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function table(key: 'monthsLong' | 'weekdaysLong'): string[] | null {
  const values: unknown = i18n.t(`common:${key}`, { returnObjects: true })
  return Array.isArray(values) ? (values as string[]) : null
}

/**
 * The class modal's header date: "jueves 14 de agosto".
 *
 * The weekday is lowercased because it sits mid-title ("Clase del jueves 14
 * de agosto"), the same Spanish rule Hoy's empty state applies to "el lunes".
 * The day drops its leading zero here — spelled-out prose reads "7 de
 * agosto", not "07 de agosto" — which is exactly why this is a second format
 * and not the chip one with different separators.
 *
 * The year is omitted: the header names the class you are marking, and you
 * reached it from a date you already picked.
 */
export function formatClassDateLong(date: string): string {
  const match = LOCAL_DATE_PATTERN.exec(date)
  const months = table('monthsLong')
  // `weekdaysLong` is MONDAY-first (0=Lunes), so the JS Sunday-based day has
  // to go through the shared mapping — never indexed directly.
  const weekdays = table('weekdaysLong')
  if (match === null || months === null || weekdays === null) {
    return date
  }
  const monthLabel: unknown = months[Number(match[2]) - 1]
  // `parseISO` on an offset-free string yields a LOCAL date, matching the
  // storage convention (design §3a) and `classOccurrence.ts`'s own parsing.
  const weekdayLabel: unknown = weekdays[toMondayFirstIndex(parseISO(date).getDay())]
  if (typeof monthLabel !== 'string' || typeof weekdayLabel !== 'string') {
    return date
  }
  return i18n.t('clases:claseModal.headerDate', {
    weekday: weekdayLabel.toLowerCase(),
    day: Number(match[3]),
    month: monthLabel
  })
}
