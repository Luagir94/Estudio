// Pure, framework-free formatting for a final exam instance's `takenOn` date
// (design node `grfpH`'s finals list). Same lowercase month table and
// zero-padded-day convention `carreras/domain/period.ts`'s `formatDay` reads
// from `common:monthsShort` — reused directly rather than inventing a fifth
// date format. The year is always shown (unlike the period-range helpers,
// which only add it when needed): a mesa can be years old, and dropping the
// year would make an old date read as if it happened this year.
import i18n from '../../i18n'

export function formatTakenOn(date: string): string {
  const months = i18n.t('common:monthsShort', { returnObjects: true }) as string[]
  const [year, month, day] = date.split('-')
  return `${day} ${months[Number(month) - 1]} ${year}`
}
