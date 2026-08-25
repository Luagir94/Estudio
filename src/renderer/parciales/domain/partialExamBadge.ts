// Pure, framework-free composition of a parcial's result badge label.
//
// The approved design puts the nota INSIDE the badge rather than in a fourth
// column — "Aprobado · 8" — so the label is a COMPOSITION, not a lookup, and
// composing it is worth a tested function instead of an inline ternary in
// JSX. Same shape as the finales chip label, lifted out of the component
// because a parcial carries its nota on every result, not only on approval.
//
// The translator is INJECTED rather than imported: this module holds no
// i18next instance, so it stays pure and its tests can feed it the real
// catalog (or any other) without a provider.
import type { PartialExamResult } from '../../../shared/ipc/materias'

export interface PartialExamBadgeInput {
  result: PartialExamResult
  /** `null` = "sin nota", a first-class state — never rendered as a 0. */
  grade: number | null
}

/**
 * A nota is quoted "7,5", never "7.5" — same voice as the finales chip and
 * the carreras promedios, without their forced decimals: an 8 reads "8".
 */
const gradeFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

export function formatPartialGrade(grade: number): string {
  return gradeFormat.format(grade)
}

/**
 * The badge's label: the result on its own, or the result carrying its nota.
 *
 * Note what does NOT happen here: no result is treated as "the one that may
 * carry a nota". A reprobado 3 is the number on the acta and reads exactly
 * like an aprobado 8 does.
 */
export function partialExamBadgeLabel(
  translate: (key: string, options?: Record<string, unknown>) => string,
  parcial: PartialExamBadgeInput
): string {
  const resultLabel = translate(`parcialesSection.resultLabels.${parcial.result}`)
  if (parcial.grade === null) {
    return resultLabel
  }
  return translate('parcialesSection.resultWithGrade', {
    result: resultLabel,
    grade: formatPartialGrade(parcial.grade)
  })
}
