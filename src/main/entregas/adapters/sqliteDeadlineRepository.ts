import { eq } from 'drizzle-orm'
import type { CreateDeadlineInput, DeadlineWithSubject, UpdateDeadlineInput } from '../../../shared/ipc/entregas'
import type { AppDatabase } from '../../db/connection'
import { deadlines, subjects } from '../../db/schema'

export interface DeadlineRepository {
  create(input: CreateDeadlineInput): DeadlineWithSubject
  list(): DeadlineWithSubject[]
  /** Reuses the create schema plus `id` (spec: "Edit corrects a wrong fecha límite"). Null if not found. */
  update(input: UpdateDeadlineInput): DeadlineWithSubject | null
  /** Binary only — no partial-progress state (spec: "Toggle done/pending"). Null if not found. */
  setDone(id: number, done: boolean): DeadlineWithSubject | null
  /**
   * Deletes the deadline entirely — NEVER marks it done (spec: "Delete
   * removes a cancelled deadline entirely, not as done"). Cascades to
   * nothing (Deadline is not an aggregate root for anything else).
   */
  remove(id: number): boolean
}

const SUBJECT_JOIN_COLUMNS = {
  id: deadlines.id,
  subjectId: deadlines.subjectId,
  title: deadlines.title,
  type: deadlines.type,
  dueAt: deadlines.dueAt,
  done: deadlines.done,
  subjectName: subjects.name,
  subjectColor: subjects.color
}

function findWithSubject(db: AppDatabase, deadlineId: number): DeadlineWithSubject | null {
  const row = db
    .select(SUBJECT_JOIN_COLUMNS)
    .from(deadlines)
    .innerJoin(subjects, eq(deadlines.subjectId, subjects.id))
    .where(eq(deadlines.id, deadlineId))
    .get()
  return row ?? null
}

/**
 * SQLite-backed implementation of the deadline-calendar port (design §2,
 * amendment 7). Unlike ScheduleSlot, Deadline is NOT owned by the Subject
 * aggregate for lifecycle purposes — every command here operates on the
 * `deadlines` table directly, with its own full-CRUD command set.
 */
export function createSqliteDeadlineRepository(db: AppDatabase): DeadlineRepository {
  return {
    create(input) {
      const inserted = db
        .insert(deadlines)
        .values({
          subjectId: input.subjectId,
          title: input.title,
          type: input.type,
          dueAt: input.dueAt,
          done: false
        })
        .returning()
        .get()

      const withSubject = findWithSubject(db, inserted.id)
      if (!withSubject) {
        // Unreachable under the `subjectId` FK constraint (foreign_keys=ON
        // would have already rejected the insert) — guarded for type safety.
        throw new Error(`No subject found for newly created deadline ${inserted.id}`)
      }
      return withSubject
    },
    list() {
      return db
        .select(SUBJECT_JOIN_COLUMNS)
        .from(deadlines)
        .innerJoin(subjects, eq(deadlines.subjectId, subjects.id))
        .all()
    },
    update(input) {
      const updated = db
        .update(deadlines)
        .set({
          subjectId: input.subjectId,
          title: input.title,
          type: input.type,
          dueAt: input.dueAt
        })
        .where(eq(deadlines.id, input.id))
        .returning()
        .get()
      if (!updated) {
        return null
      }
      return findWithSubject(db, input.id)
    },
    setDone(id, done) {
      const updated = db.update(deadlines).set({ done }).where(eq(deadlines.id, id)).returning().get()
      if (!updated) {
        return null
      }
      return findWithSubject(db, id)
    },
    remove(id) {
      const existing = db.select().from(deadlines).where(eq(deadlines.id, id)).get()
      if (!existing) {
        return false
      }
      // ONLY this deadline row is deleted — it cascades to nothing (spec:
      // "Deleting a deadline cascades to nothing", Deadline is not an
      // aggregate root for anything else).
      db.delete(deadlines).where(eq(deadlines.id, id)).run()
      return true
    }
  }
}
