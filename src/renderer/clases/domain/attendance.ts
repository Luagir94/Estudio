// Pure, framework-free domain module (design §4). MUST NOT import electron
// or better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule.
//
// The asistencia percentage is DERIVED, never stored: it is a reading of the
// marks, and a stored copy would be a second source of truth free to drift
// out of step with them (same rule `subjects.outcome`'s neighbours follow,
// and the same reason the subject's `regularity` goes the other way — that
// one is the cátedra's verdict, which no arrangement of marks produces).
import type { AttendanceStatus } from '../../../shared/ipc/materias'

/** Just the mark. The date is what identifies a mark; the ratio does not care which day it was. */
export interface AttendanceMarkLike {
  status: AttendanceStatus
}

export interface AttendanceSummary {
  /** Classes marked `presente`. */
  present: number
  /** Classes marked `ausente`. */
  absent: number
  /** `present + absent`. Feriados are in NEITHER side of the ratio — see below. */
  counted: number
  /**
   * `present / counted`, rounded for display. `null` — never 0 — when
   * `counted` is 0: with nothing counted the question has not been asked yet,
   * and a 0% would read as "you have missed everything", which is the exact
   * opposite of the truth. The card renders a distinct state for it.
   */
  percent: number | null
  /**
   * Whether the subject's declared minimum is met. `null` in two different
   * situations that the card tells apart by looking at `percent`:
   *   - there is no percentage yet (nothing to judge), or
   *   - the subject declares NO minimum, which is not "a minimum of zero" —
   *     it is the absence of a claim, so the card shows the number with no
   *     verdict and no "mínimo" clause.
   */
  meetsMinimum: boolean | null
}

/**
 * The asistencia reading for one subject.
 *
 * `feriado` is excluded from BOTH the numerator and the denominator. A
 * cancelled class is not one you missed and not one you attended: counting it
 * as an absence would punish the student for the cátedra's day off, and
 * counting it as a presence would inflate the number with classes nobody
 * gave. It leaves the ratio entirely, which is also why a subject with
 * nothing but feriados has no percentage rather than 100%.
 *
 * `percent` is rounded to a whole number because that is what the approved
 * card shows ("86% presente"). `meetsMinimum` deliberately judges the EXACT
 * ratio instead: the number on the card is a reading, but the number the
 * cátedra will compute is the real one, so a card must never say "you are
 * fine" about a ratio that is not. That means a percentage displayed as
 * exactly the minimum can still read as urgent — the honest way round.
 */
export function summarizeAttendance(
  marks: AttendanceMarkLike[],
  attendanceMinPercent: number | null
): AttendanceSummary {
  const present = marks.filter((mark) => mark.status === 'presente').length
  const absent = marks.filter((mark) => mark.status === 'ausente').length
  const counted = present + absent

  if (counted === 0) {
    return { present, absent, counted, percent: null, meetsMinimum: null }
  }

  const exact = (present / counted) * 100
  return {
    present,
    absent,
    counted,
    percent: Math.round(exact),
    meetsMinimum: attendanceMinPercent === null ? null : exact >= attendanceMinPercent
  }
}
