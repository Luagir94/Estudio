import { z } from 'zod'
import {
  type GradeValidationResult,
  type GradingRules,
  type GradingScheme,
  validateGrade
} from '../../../shared/domain/grading'

// Re-exported so callers in this slice keep importing the program's rules
// from the program module. The implementation itself lives in `shared/` —
// main enforces the SAME rule at the write boundary, and one rule must have
// one implementation.
export { validateGrade }
export type { GradeValidationResult, GradingRules, GradingScheme }

// Pure, framework-free domain module (design §4). MUST NOT import electron
// or better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule (see tooling/dependencyGuard.test.ts).
//
// A Program is a carrera ("Abogacía") or a standalone course ("Curso de
// Bartender", "Curso de DJ"). The distinction people expect between "carrera"
// and "curso" is NOT modelled: a course with a fixed duration is a program
// with one period, and open-ended classes are a program with one open-ended
// period (see period.ts). One entity covers all three.

// An empty string is treated the same as "not provided" — HTML text inputs
// emit '' rather than undefined when left blank (same precedent as
// shared/ipc/materias.ts's optionalTextField).
const optionalInstitution = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.string().trim().min(1).nullable().default(null)
)

export const programSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required'),
    institution: optionalInstitution,
    color: z.string().trim().min(1, 'color is required'),
    gradingScheme: z.enum(['numerico', 'binario']),
    // The TOP of the scale, not a fixed 1-10. Argentina's 1-10 is not
    // universal and this app already exists because institutions differ —
    // hardcoding the scale here would be the same mistake as deriving period
    // dates from the period's kind.
    gradeScale: z.number().int().min(2).max(100).nullable().default(null)
  })
  .superRefine((program, ctx) => {
    if (program.gradingScheme === 'numerico' && program.gradeScale === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['gradeScale'],
        message: 'gradeScale is required when gradingScheme is numerico'
      })
    }
    if (program.gradingScheme === 'binario' && program.gradeScale !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['gradeScale'],
        message: 'gradeScale must be absent when gradingScheme is binario'
      })
    }
  })

export type ProgramInput = z.infer<typeof programSchema>

/** Minimal, zod-version-agnostic issue shape — only what callers need. */
export interface ProgramValidationIssue {
  path: PropertyKey[]
  message: string
}

export type ProgramValidationResult =
  { ok: true; program: ProgramInput } | { ok: false; errors: ProgramValidationIssue[] }

/**
 * Validates a raw payload against the Program entity shape. Pure function:
 * no side effects, no I/O.
 */
export function createProgram(input: unknown): ProgramValidationResult {
  const result = programSchema.safeParse(input)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
    }
  }
  return { ok: true, program: result.data }
}

export interface GradedSubject {
  grade: number | null
  /**
   * Whether the subject counts as passed. Resolved by the caller from
   * materias/domain/subjectStatus.ts — passing it in keeps this module free
   * of any dependency on the subject state machine, which depends on periods,
   * which live here.
   */
  passed: boolean
}

/**
 * Whether ANY subject under the program has been evaluated yet — a grade, a
 * recorded outcome, or a passed final. Pure function over the roll-up main
 * already ships in `ProgramWithPeriods.gradedSubjects`.
 *
 * This is the rule that decides whether a carrera's grading scheme is still
 * changeable. Editing `name`, `institution` or `color` is always safe, but the
 * scheme and its scale are the units every recorded grade is expressed in:
 * moving a graded 1-10 program to 1-100 does not RESCALE those grades, it
 * silently REINTERPRETS them, and a 7 quietly becomes a 7-out-of-100. Turning
 * a graded program into a pass/fail one is worse — it strands every number.
 *
 * So the answer is not "never changeable" (a carrera created wrong last minute
 * has nothing to lose) but "changeable until the first evaluation lands".
 *
 * All three signals count, not just `grade`: a `binario` program never records
 * a number, so asking only about grades would report it as untouched forever
 * and let its scheme flip out from under work already closed.
 */
export function hasRecordedEvaluations(
  subjects: { grade: number | null; outcome: string | null; hasApprovedFinal: boolean }[]
): boolean {
  return subjects.some((subject) => subject.grade !== null || subject.outcome !== null || subject.hasApprovedFinal)
}

export interface ProgramAverage {
  /** Average over every graded subject. `null` when nothing is graded. */
  withFailed: number | null
  /** Average over the passed ones only. `null` when none passed. */
  withoutFailed: number | null
  gradedSubjects: number
  failedSubjects: number
}

function mean(grades: number[]): number | null {
  if (grades.length === 0) {
    return null
  }
  const total = grades.reduce((sum, grade) => sum + grade, 0)
  // Two decimals: promedios are read, compared and quoted, so the domain
  // fixes the precision instead of letting each screen round differently.
  return Math.round((total / grades.length) * 100) / 100
}

/**
 * The program's average — only meaningful under a `numerico` scheme; a
 * `binario` program simply has no graded subjects to feed it.
 *
 * BOTH averages are reported because both are asked for: "con aplazos" is
 * the honest one and "sin aplazos" is the one most institutions publish.
 * Picking one for the user would be picking a side in an argument that is
 * not ours.
 *
 * Subjects with no grade are skipped, never counted as a zero — an ungraded
 * subject is missing information, not a bad result.
 */
export function calculateProgramAverage(subjects: GradedSubject[]): ProgramAverage {
  const graded = subjects.filter((subject): subject is GradedSubject & { grade: number } => subject.grade !== null)
  const passed = graded.filter((subject) => subject.passed)

  return {
    withFailed: mean(graded.map((subject) => subject.grade)),
    withoutFailed: mean(passed.map((subject) => subject.grade)),
    gradedSubjects: graded.length,
    failedSubjects: graded.length - passed.length
  }
}

// es-AR because the copy is: the whole app speaks rioplatense Spanish, and a
// promedio is quoted "8,50", never "8.5".
const averageFormat = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * How a promedio is PRINTED — comma decimal, always two places ("8,50").
 * Fixed here for the same reason `mean` fixes its rounding: one screen must
 * not read "8,5" while another says "8.50".
 */
export function formatAverage(value: number): string {
  return averageFormat.format(value)
}

/**
 * Share of the carrera's subjects already passed, as a whole 0-100 percent
 * for the avance card's progress fill. An empty carrera reads 0 — there is
 * no share of nothing — and the value is clamped so an approved count ahead
 * of a stale total can never overflow the track.
 */
export function approvedProgressPercent(approved: number, total: number): number {
  if (total <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, Math.round((approved / total) * 100)))
}
