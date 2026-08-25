import { eq } from 'drizzle-orm'
import type { CreatePartialExamInput, UpdatePartialExamInput } from '../../../shared/ipc/parciales'
import type { PartialExamRecord, PartialExamResult } from '../../../shared/ipc/materias'
import { validateGrade } from '../../../shared/domain/grading'
import type { AppDatabase } from '../../db/connection'
import { partialExams, periods, programs, subjects } from '../../db/schema'

export interface PartialExamRepository {
  create(input: CreatePartialExamInput): PartialExamRecord
  listBySubject(subjectId: number): PartialExamRecord[]
  /** Null if not found. */
  update(input: UpdatePartialExamInput): PartialExamRecord | null
  remove(id: number): boolean
}

const RESULTS = new Set(['pendiente', 'aprobado', 'reprobado'])

// SQLite has no enums; an unrecognised value means the row was written by
// something other than the validated commands, which is corruption worth
// failing on rather than coercing into a valid-looking state. Same guard
// sqliteFinalExamRepository applies to `final_exams.result`.
function toRecord(row: {
  id: number
  subjectId: number
  label: string
  takenOn: string | null
  result: string
  grade: number | null
}): PartialExamRecord {
  if (!RESULTS.has(row.result)) {
    throw new Error(`Unknown partial exam result "${row.result}"`)
  }
  return { ...row, result: row.result as PartialExamResult }
}

/**
 * SQLite-backed implementation of the partial-exam port.
 *
 * Note what is NOT here, and never will be: any write to
 * `subjects.regularity`. The condición is the CÁTEDRA's verdict, recorded by
 * the student — no arrangement of these rows produces it, because the rule
 * that would map results onto a condición differs per cátedra. This
 * repository records what happened in a parcial; what it MEANS is not its
 * business. (It does not write `subjects.outcome` either, for the same reason
 * sqliteFinalExamRepository does not.)
 */
export function createSqlitePartialExamRepository(db: AppDatabase): PartialExamRepository {
  /**
   * The grade's legality belongs to the PROGRAM, reached through the period —
   * the same cross-entity rule `subjects.grade` and `final_exams.grade`
   * follow, run at this write boundary the same way, with the same shared
   * implementation the renderer form already applied.
   *
   * `null` short-circuits: "sin nota" is legal under every scheme, including
   * on a subject that belongs to no program at all.
   */
  function assertGradeIsLegal(subjectId: number, grade: number | null): void {
    if (grade === null) {
      return
    }
    const program =
      db
        .select({ gradingScheme: programs.gradingScheme, gradeScale: programs.gradeScale })
        .from(subjects)
        .innerJoin(periods, eq(subjects.periodId, periods.id))
        .innerJoin(programs, eq(periods.programId, programs.id))
        .where(eq(subjects.id, subjectId))
        .get() ?? null
    if (program === null) {
      throw new Error('Cannot grade a partial exam whose subject does not belong to a program')
    }
    const scheme = program.gradingScheme
    if (scheme !== 'numerico' && scheme !== 'binario') {
      throw new Error(`Unknown grading scheme stored for program: ${scheme}`)
    }
    const validation = validateGrade({ gradingScheme: scheme, gradeScale: program.gradeScale }, grade)
    if (!validation.ok) {
      throw new Error(validation.error)
    }
  }

  return {
    create(input) {
      // Checked BEFORE the insert, unlike the finales flow — a parcial is
      // born with its nota, so this is the first and only chance to refuse an
      // illegal one.
      assertGradeIsLegal(input.subjectId, input.grade)
      return toRecord(
        db
          .insert(partialExams)
          .values({
            subjectId: input.subjectId,
            label: input.label,
            takenOn: input.takenOn,
            result: input.result,
            grade: input.grade
          })
          .returning()
          .get()
      )
    },
    listBySubject(subjectId) {
      return db.select().from(partialExams).where(eq(partialExams.subjectId, subjectId)).all().map(toRecord)
    },
    update(input) {
      const existing = db.select().from(partialExams).where(eq(partialExams.id, input.id)).get()
      if (!existing) {
        return null
      }
      assertGradeIsLegal(existing.subjectId, input.grade)

      // The nota is written on WHATEVER result, and is never cleared by a
      // transition. That is the deliberate difference from
      // `finalExams.grade`: a mesa's nota only exists because it was
      // approved, so leaving 'aprobado' voids it — but a parcial's nota is
      // the number on the acta, and a 3 stays a 3 whichever way the result
      // is later corrected.
      const updated = db
        .update(partialExams)
        .set({
          label: input.label,
          takenOn: input.takenOn,
          result: input.result,
          grade: input.grade
        })
        .where(eq(partialExams.id, input.id))
        .returning()
        .get()
      return updated ? toRecord(updated) : null
    },
    remove(id) {
      const existing = db.select().from(partialExams).where(eq(partialExams.id, id)).get()
      if (!existing) {
        return false
      }
      db.delete(partialExams).where(eq(partialExams.id, id)).run()
      return true
    }
  }
}
