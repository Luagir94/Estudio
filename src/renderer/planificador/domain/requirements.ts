import type {
  PrerequisiteLevel,
  ScheduleSlotRecord,
  SubjectOutcome,
  SubjectPrerequisiteEdge,
  SubjectRegularity
} from '../../../shared/ipc/materias'
import { type FinalExamLike, resolveFinalsVerdict } from '../../materias/domain/subjectStatus'

// Pure, framework-free domain module (design §4). MUST NOT import electron or
// better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule.
//
// This module answers ONE question and its consequence: has the required
// materia got far enough, and therefore may this one be cursada?
//
// It deliberately does not re-derive what "passed" means. `resolveFinalsVerdict`
// in materias/domain/subjectStatus.ts already owns the rule that one approved
// mesa wins and that failing every mesa closes nothing, and a second copy of it
// here would be free to disagree with the ESTADO badge sitting on the same
// screen. A test pins the two together.

/** The facts a requirement is judged against — never a verdict. */
export interface RequirementSubjectState {
  /** What the student decided. `null` = nothing decided yet. */
  outcome: SubjectOutcome | null
  /** What the cátedra granted. `null` = not declared yet. */
  regularity: SubjectRegularity | null
  finals: FinalExamLike[]
}

/**
 * Whether the materia counts as PASSED.
 *
 * Two ways in, and only two: the student closed it as `aprobada`, or they put
 * it in `finalPendiente` and a mesa came back approved. An approved mesa on a
 * subject explicitly closed as `reprobada` does NOT count — that outcome is
 * the student's decision, and overriding it here would be the app arguing with
 * them.
 */
function isApproved(state: RequirementSubjectState): boolean {
  if (state.outcome === 'aprobada') {
    return true
  }
  return state.outcome === 'finalPendiente' && resolveFinalsVerdict(state.finals) === 'aprobado'
}

/**
 * Whether `state` meets a requirement at `level`.
 *
 * The load-bearing line is the `aprobada` fallback inside the `regularizada`
 * branch: PASSING A MATERIA IS STRICTLY STRONGER THAN REGULARISING IT. A
 * materia passed by final years ago may carry no `regularity` at all — the
 * column was never written — and reading that as "not regularizada" would
 * block a cursada on a requirement the student cleared twice over.
 *
 * `libre` is not a weaker regularidad, it is its negation: the cátedra saying
 * the cursada was lost.
 */
export function satisfiesLevel(state: RequirementSubjectState, level: PrerequisiteLevel): boolean {
  if (level === 'aprobada') {
    return isApproved(state)
  }
  return state.regularity === 'regular' || state.regularity === 'promocionada' || isApproved(state)
}

/** One requirement the subject does not meet — the REASON a row reads bloqueada. */
export interface UnmetRequirement {
  subjectId: number
  /**
   * `null` when the required materia is not in the payload at all. The row
   * still reads bloqueada: a rule nobody can check is not a rule that passes.
   */
  subjectName: string | null
  requiredLevel: PrerequisiteLevel
}

/** The shape `materias:list` already satisfies structurally. */
export interface EligibilitySubject extends RequirementSubjectState {
  id: number
  name: string
  code: string
  color: string
  slots: ScheduleSlotRecord[]
  prerequisites: SubjectPrerequisiteEdge[]
}

export type CandidateState = 'habilitada' | 'bloqueada'

export interface Candidate {
  subject: EligibilitySubject
  state: CandidateState
  /** Empty exactly when `state` is `habilitada`. */
  unmet: UnmetRequirement[]
}

/**
 * The materias offerable for a período's draft, each with its verdict and —
 * when blocked — the reasons.
 *
 * TWO exclusions, and no more. A materia already PASSED is not something to
 * plan, and one already IN THE DRAFT is not something to add again. Everything
 * else stays on the list, including a materia currently being cursada and one
 * closed as `reprobada`: recursarla is exactly the kind of plan this screen
 * exists for, and deciding it for the student would be the planner deciding
 * instead of avisando.
 *
 * Being `bloqueada` is NOT an exclusion. The row stays, says which requirement
 * is missing, and its + button is a lock — the student sees the whole plan de
 * estudios, not a list quietly filtered down to what the app approves of.
 */
export function listCandidates(
  subjects: readonly EligibilitySubject[],
  draftedSubjectIds: ReadonlySet<number>
): Candidate[] {
  const byId = new Map(subjects.map((subject) => [subject.id, subject]))

  return subjects
    .filter((subject) => !isApproved(subject) && !draftedSubjectIds.has(subject.id))
    .map((subject) => {
      const unmet = subject.prerequisites
        .filter((prerequisite) => {
          const required = byId.get(prerequisite.requiresSubjectId)
          return required === undefined || !satisfiesLevel(required, prerequisite.requiredLevel)
        })
        .map((prerequisite) => ({
          subjectId: prerequisite.requiresSubjectId,
          subjectName: byId.get(prerequisite.requiresSubjectId)?.name ?? null,
          requiredLevel: prerequisite.requiredLevel
        }))

      return { subject, state: unmet.length === 0 ? 'habilitada' : 'bloqueada', unmet } satisfies Candidate
    })
}
