import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import { periodStatus } from '../../carreras/domain/period'

// Pure, framework-free domain module (design §4). MUST NOT import electron or
// better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule.

/** A período the switcher may offer, flattened out of its carrera. */
export interface PlannablePeriod {
  id: number
  name: string
  startsOn: string
  /** `null` = open-ended. */
  endsOn: string | null
  /** Carried because the switcher lists several carreras at once and the names repeat. */
  programName: string
}

/**
 * The períodos it makes sense to plan, across EVERY carrera, ordered for the
 * switcher.
 *
 * Two rules:
 *
 *   - A `finalizado` período is out. There is nothing left to decide about a
 *     cuatrimestre that already ended, and offering one would invite a plan
 *     that can never happen.
 *   - Everything else stays, `proximo` FIRST. The screen is about what comes
 *     next, so the upcoming ones lead; the período running today sorts after
 *     them because adding a materia to the cuatrimestre you are already in is
 *     a real but rarer thing to do. Within each group, earliest start first.
 *
 * Deliberately does NOT pick a winner across carreras. This app has no concept
 * of an active carrera — there can be several at once and which one matters is
 * the user's call, the same rule `activeTerms.ts` states for the sidebar.
 */
export function listPlannablePeriods(programs: readonly ProgramWithPeriods[], today: Date): PlannablePeriod[] {
  return programs
    .flatMap((program) =>
      program.periods
        .filter((period) => periodStatus(period, today) !== 'finalizado')
        .map((period) => ({
          id: period.id,
          name: period.name,
          startsOn: period.startsOn,
          endsOn: period.endsOn,
          programName: program.name,
          upcoming: periodStatus(period, today) === 'proximo'
        }))
    )
    .sort((a, b) => Number(b.upcoming) - Number(a.upcoming) || a.startsOn.localeCompare(b.startsOn))
    .map(({ upcoming: _upcoming, ...period }) => period)
}
