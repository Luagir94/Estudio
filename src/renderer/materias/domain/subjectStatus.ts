import { type PeriodInterval, periodStatus } from '../../carreras/domain/period'

// Pure, framework-free domain module (design §4). MUST NOT import electron
// or better-sqlite3 — enforced by .dependency-cruiser.cjs's
// no-electron-or-sqlite-in-domain rule (see tooling/dependencyGuard.test.ts).
//
// This module is the single source of truth for "what state is this subject
// in", consumed by the Materias list filter (design node `RR85r`), the
// ESTADO column (`gs3CM`) and the standby strip on the finals screen
// (`g1HRM2`).

/**
 * What the STUDENT decided about the subject. Nullable on purpose: while the
 * period runs there is nothing to decide yet, and once it ends the null is
 * what surfaces the subject as "sin cerrar" instead of letting it disappear.
 */
export type SubjectOutcome = 'aprobada' | 'reprobada' | 'finalPendiente'

export type FinalExamResult = 'pendiente' | 'aprobado' | 'reprobado'

/**
 * What the UI shows. Note this is NOT the same set as SubjectOutcome:
 * `cursando`/`sinCerrar` are derived from the period's dates, and a subject
 * whose outcome is `finalPendiente` resolves to `aprobada`, `reprobada` or
 * `standby` depending on its exam instances — never on a stored flag.
 */
export type SubjectStatus = 'cursando' | 'sinCerrar' | 'aprobada' | 'reprobada' | 'standby'

export interface FinalExamLike {
  result: FinalExamResult
}

export interface SubjectStatusInput {
  outcome: SubjectOutcome | null
  period: PeriodInterval
  finals: FinalExamLike[]
}

/**
 * Where a subject's set of exam instances stands.
 *
 * `todasReprobadas` is a distinct verdict from `esperandoMesa` on purpose:
 * both leave the subject in standby, but only the former means there is
 * nothing left to wait for, so the screen has to offer a way out (design
 * node `vYdru` — the "Decision Prompt" on the finals screen).
 */
export type FinalsVerdict = 'aprobado' | 'sinInstancias' | 'esperandoMesa' | 'todasReprobadas'

/**
 * Collapses a set of final-exam instances into one verdict.
 *
 * A single pass wins over any number of failures — you only have to pass a
 * final once, and that is the ONLY verdict that closes a subject on its own,
 * because passing is unambiguous.
 *
 * Failing every instance deliberately does NOT close anything. There is
 * always another mesa, so "no me da más" is the student's call, not the
 * app's — see resolveSubjectStatus.
 */
export function resolveFinalsVerdict(finals: FinalExamLike[]): FinalsVerdict {
  if (finals.some((final) => final.result === 'aprobado')) {
    return 'aprobado'
  }
  if (finals.length === 0) {
    return 'sinInstancias'
  }
  return finals.some((final) => final.result === 'pendiente') ? 'esperandoMesa' : 'todasReprobadas'
}

export type FinalExamCounts = Record<FinalExamResult, number>

/** Per-result tallies for the standby strip's counters (design node `bQ1eQ`). */
export function countFinalsByResult(finals: FinalExamLike[]): FinalExamCounts {
  const counts: FinalExamCounts = { pendiente: 0, aprobado: 0, reprobado: 0 }
  for (const final of finals) {
    counts[final.result] += 1
  }
  return counts
}

/**
 * The subject's state machine.
 *
 * The student's own decision wins over the calendar — a subject passed by
 * promoción reads `aprobada` while its period is still running. Only when
 * nothing was decided does the period's clock speak, and an ended period
 * with no decision is deliberately NOT silent: it reads `sinCerrar` so the
 * Materias screen can ask (design node `LR0JC` — the close banner).
 *
 * `finalPendiente` is the one outcome that is not terminal: it hands the
 * verdict over to the exam instances. Passing one closes the subject as
 * `aprobada` automatically — passing is unambiguous.
 *
 * Failing every instance does NOT. The subject stays in `standby` until the
 * student explicitly sets `outcome` to 'reprobada', because there is always
 * another mesa and only they can say they are done with it. That also means
 * the state never has to be walked back: recording a new instance changes
 * nothing that was written, it just adds a row.
 */
export function resolveSubjectStatus(input: SubjectStatusInput, today: Date): SubjectStatus {
  const { outcome, period, finals } = input

  if (outcome === 'aprobada' || outcome === 'reprobada') {
    return outcome
  }

  if (outcome === 'finalPendiente') {
    return resolveFinalsVerdict(finals) === 'aprobado' ? 'aprobada' : 'standby'
  }

  return periodStatus(period, today) === 'finalizado' ? 'sinCerrar' : 'cursando'
}

export interface PassedRecord {
  outcome: SubjectOutcome | null
  /** Whether ANY final-exam instance for the subject is `aprobado`. */
  hasApprovedFinal: boolean
}

/**
 * Whether a subject counts as passed, from the compact shape a list payload
 * can carry (see shared/ipc/carreras.ts's `gradedSubjectSchema`).
 *
 * This exists so main never has to answer the question in SQL — that would
 * put a second copy of the rule outside the domain. It agrees with
 * `resolveSubjectStatus` by construction, and a test pins the two together.
 *
 * An explicit `reprobada` wins even if an approved final exists: the student
 * closed it, and their decision is the whole point of that outcome.
 */
export function isPassed(record: PassedRecord): boolean {
  if (record.outcome === 'aprobada') {
    return true
  }
  if (record.outcome === 'finalPendiente') {
    return record.hasApprovedFinal
  }
  return false
}

export type SubjectStatusFilter = 'activas' | 'standby' | 'aprobadas' | 'reprobadas' | 'sinCerrar' | 'todas'

const FILTER_STATUS: Record<Exclude<SubjectStatusFilter, 'todas'>, SubjectStatus> = {
  activas: 'cursando',
  standby: 'standby',
  aprobadas: 'aprobada',
  reprobadas: 'reprobada',
  sinCerrar: 'sinCerrar'
}

/**
 * Filter predicate for the Materias status chips (design node `RR85r`).
 * `activas` is the screen's default and means "being taken right now" — a
 * subject in standby is not active, it is waiting on a final.
 */
export function matchesStatusFilter(status: SubjectStatus, filter: SubjectStatusFilter): boolean {
  return filter === 'todas' || FILTER_STATUS[filter] === status
}
