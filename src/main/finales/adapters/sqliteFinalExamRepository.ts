import { eq } from 'drizzle-orm'
import type { CreateFinalExamInput, UpdateFinalExamInput } from '../../../shared/ipc/finales'
import type { FinalExamRecord, FinalExamResult } from '../../../shared/ipc/materias'
import type { AppDatabase } from '../../db/connection'
import { finalExams } from '../../db/schema'

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
      const updated = db
        .update(finalExams)
        .set({ label: input.label, takenOn: input.takenOn, result: input.result })
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
