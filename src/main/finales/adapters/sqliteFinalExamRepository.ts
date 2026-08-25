import { eq } from 'drizzle-orm'
import type { CreateFinalExamInput, UpdateFinalExamInput } from '../../../shared/ipc/finales'
import type { FinalExamRecord, FinalExamResult } from '../../../shared/ipc/materias'
import { validateGrade } from '../../../shared/domain/grading'
import type { AppDatabase } from '../../db/connection'
import { finalExams, periods, programs, subjects } from '../../db/schema'

export interface FinalExamRepository {
  create(input: CreateFinalExamInput): FinalExamRecord
  listBySubject(subjectId: number): FinalExamRecord[]
  /** Null if not found. */
  update(input: UpdateFinalExamInput): FinalExamRecord | null
  remove(id: number): boolean
}

const RESULTS = new Set(['pendiente', 'aprobado', 'reprobado'])

function toRecord(row: {
  id: number
  subjectId: number
  label: string
  takenOn: string | null
  result: string
  grade: number | null
}): FinalExamRecord {
  if (!RESULTS.has(row.result)) {
    throw new Error(`Unknown final exam result "${row.result}"`)
  }
  return { ...row, result: row.result as FinalExamResult }
}

/**
 * SQLite-backed implementation of the final-exam port.
 *
 * Note what is NOT here: any write to `subjects.outcome`. The subject's
 * state is DERIVED from these rows (materias/domain/subjectStatus.ts) —
 * passing a mesa closes the subject as aprobada without this repository
 * touching it, and failing every mesa deliberately closes nothing, because
 * only the student may declare a subject lost.
 */
export function createSqliteFinalExamRepository(db: AppDatabase): FinalExamRepository {
  return {
    create(input) {
      return toRecord(
        db
          .insert(finalExams)
          .values({
            subjectId: input.subjectId,
            label: input.label,
            takenOn: input.takenOn,
            result: input.result
          })
          .returning()
          .get()
      )
    },
    listBySubject(subjectId) {
      return db.select().from(finalExams).where(eq(finalExams.subjectId, subjectId)).all().map(toRecord)
    },
    update(input) {
      // A nota needs an APPROVED result and a program that grades at all.
      // The legality check mirrors sqliteSubjectRepository.setOutcome: the
      // program is reached through the chain (mesa → subject → period →
      // program), and the shared validateGrade — already run in the renderer
      // form — runs again here at the write boundary.
      if (input.grade !== null) {
        if (input.result !== 'aprobado') {
          throw new Error('A grade is only valid on an approved final exam')
        }
        const existing = db.select().from(finalExams).where(eq(finalExams.id, input.id)).get()
        if (!existing) {
          return null
        }
        const program =
          db
            .select({ gradingScheme: programs.gradingScheme, gradeScale: programs.gradeScale })
            .from(subjects)
            .innerJoin(periods, eq(subjects.periodId, periods.id))
            .innerJoin(programs, eq(periods.programId, programs.id))
            .where(eq(subjects.id, existing.subjectId))
            .get() ?? null
        if (program === null) {
          throw new Error('Cannot grade a final exam whose subject does not belong to a program')
        }
        const scheme = program.gradingScheme
        if (scheme !== 'numerico' && scheme !== 'binario') {
          throw new Error(`Unknown grading scheme stored for program: ${scheme}`)
        }
        const validation = validateGrade({ gradingScheme: scheme, gradeScale: program.gradeScale }, input.grade)
        if (!validation.ok) {
          throw new Error(validation.error)
        }
      }

      // The nota belongs to the approved result: moving AWAY from 'aprobado'
      // clears it in the same write, so no stale number survives to be
      // resurrected by a later re-approval. This clearing is intentional.
      const updated = db
        .update(finalExams)
        .set({
          label: input.label,
          takenOn: input.takenOn,
          result: input.result,
          grade: input.result === 'aprobado' ? input.grade : null
        })
        .where(eq(finalExams.id, input.id))
        .returning()
        .get()
      return updated ? toRecord(updated) : null
    },
    remove(id) {
      const existing = db.select().from(finalExams).where(eq(finalExams.id, id)).get()
      if (!existing) {
        return false
      }
      db.delete(finalExams).where(eq(finalExams.id, id)).run()
      return true
    }
  }
}
