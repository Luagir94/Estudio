// Pure, dependency-free grading rule shared by BOTH processes.
//
// It lives in `shared/` rather than in a renderer slice because both sides
// genuinely need it and neither may own it: the renderer validates the form
// so the user is told before submitting, and main enforces it at the write
// boundary so a bad payload never reaches SQLite. Implementing it twice —
// once in TS and once as a SQL condition — is exactly the drift this repo
// already avoids for `isPassed` (see materias/domain/subjectStatus.ts).
//
// No zod import on purpose: `shared/ipc/channels.ts` documents why a
// dependency-free shared module is worth keeping that way.

export type GradingScheme = 'numerico' | 'binario'

export interface GradingRules {
  gradingScheme: GradingScheme
  /** Top of the scale (10, 100, …). `null` under `binario`. */
  gradeScale: number | null
}

export type GradeValidationResult = { ok: true } | { ok: false; error: string }

/**
 * Whether a subject's grade is admissible under its program's scheme.
 *
 * This is a CROSS-ENTITY rule — the grade lives on the subject but its
 * legality is decided by the program — so it belongs to neither entity's own
 * schema and must be called wherever a grade is written.
 *
 * `null` is always valid: "not graded yet" is a legitimate state under both
 * schemes, and under `binario` it is the only one.
 */
export function validateGrade(program: GradingRules, grade: number | null): GradeValidationResult {
  if (grade === null) {
    return { ok: true }
  }
  if (program.gradingScheme === 'binario') {
    return { ok: false, error: 'a pass/fail program does not carry grades' }
  }
  const top = program.gradeScale ?? 0
  if (grade < 0 || grade > top) {
    return { ok: false, error: `grade must be between 0 and ${top}` }
  }
  return { ok: true }
}
