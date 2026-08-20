// Pure, framework-free domain module (design §4). MUST NOT import electron
// or better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule.
//
// THE CATALOGUE OF PERIOD KINDS, and the names each one derives.
//
// This REVERSES the "kind is free text on purpose" note in period.ts, on the
// owner's explicit call. The free-text model let the same carrera hold "ddd",
// "2do cuatri" and "cuatrimestre" side by side, which is a period table that
// cannot be read at a glance — the inconsistency the closed catalogue exists
// to end. The cost is real and accepted: an institution whose vocabulary is
// not in this list has to pick the nearest kind, and adding one is a code
// change.
//
// A kind still does NOT define any date. It answers one question only — INTO
// HOW MANY PARTS DOES THIS KIND CUT A YEAR — and the answer is what the name
// picker offers. The dates stay entirely the user's, exactly as before.

export const PERIOD_KINDS = ['anual', 'cuatrimestre', 'trimestre', 'bimestre', 'mensual', 'curso'] as const

export type PeriodKind = (typeof PERIOD_KINDS)[number]

/**
 * How many of this kind tile one academic year.
 *
 * `null` for `curso`, which does not tile anything: a course runs from when
 * it starts to whenever it ends (or never), so there is no "which of the N"
 * to answer and therefore no number to put in its name.
 */
export function divisionsPerYear(kind: PeriodKind): number | null {
  return DIVISIONS[kind]
}

const DIVISIONS: Record<PeriodKind, number | null> = {
  anual: 1,
  cuatrimestre: 2,
  trimestre: 3,
  bimestre: 4,
  mensual: 12,
  curso: null
}

// Spanish ordinals are irregular ("3er", not "3ro"), so they are spelled out
// rather than built from the number. Four is all any kind needs: the only
// kind past four is `mensual`, and twelve divisions of a year are months,
// which have names of their own.
const ORDINALS = ['1er', '2do', '3er', '4to']

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
]

/**
 * The names this kind allows, in calendar order — the options behind the
 * name picker.
 *
 * The year is NOT part of the name. It is derived from the start date
 * (period.ts's `derivePeriodYear`) and printed beside the name everywhere it
 * matters, so baking it in would be a second, drifting copy of a fact the
 * dates already carry — the same reason there is no "año" field to fill in.
 */
export function periodNameOptions(kind: PeriodKind): string[] {
  if (kind === 'mensual') {
    return [...MONTHS]
  }
  if (kind === 'anual') {
    return ['Anual']
  }
  const divisions = divisionsPerYear(kind)
  if (divisions === null) {
    return ['Curso']
  }
  return ORDINALS.slice(0, divisions).map((ordinal) => `${ordinal} ${kind}`)
}

/**
 * Whether a stored `kind` string is one this catalogue knows.
 *
 * Periods saved before the catalogue existed hold arbitrary text. They are
 * shown as they were saved, but the edit form uses this to start its picker
 * EMPTY rather than guessing which catalogued kind the user meant — mapping
 * "ddd" to "cuatrimestre" would be the app inventing an answer it does not
 * have, and it would silently re-date nothing while renaming everything.
 */
export function isPeriodKind(value: string): value is PeriodKind {
  return (PERIOD_KINDS as readonly string[]).includes(value)
}
