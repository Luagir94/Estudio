import { eq, inArray } from 'drizzle-orm'
import type {
  CreatePeriodInput,
  CreateProgramInput,
  DeletePeriodResult,
  DeleteProgramResult,
  GradedSubjectRecord,
  GradingScheme,
  PeriodRecord,
  ProgramRecord,
  ProgramWithPeriods,
  SubjectOutcome,
  UpdatePeriodInput,
  UpdateProgramInput
} from '../../../shared/ipc/carreras'
import type { AppDatabase } from '../../db/connection'
import { finalExams, periods, programs, subjects } from '../../db/schema'

export interface ProgramRepository {
  create(input: CreateProgramInput): ProgramRecord
  list(): ProgramWithPeriods[]
  /** Null if not found. */
  detail(id: number): ProgramWithPeriods | null
  /**
   * Corrects an existing program in place, periods and subjects untouched.
   * Null if not found.
   *
   * The scheme and scale are writable HERE, at the data layer, because
   * "may this carrera still change its scale?" is a question about its
   * recorded grades — a domain rule, answered in the renderer
   * (carreras/domain/program.ts's `hasRecordedEvaluations`). Same split as
   * `gradedSubjects`: main ships facts, the renderer applies the rule.
   */
  update(input: UpdateProgramInput): ProgramRecord | null
  createPeriod(input: CreatePeriodInput): PeriodRecord
  /** Corrects an existing period's name, kind and dates. Null if not found. */
  updatePeriod(input: UpdatePeriodInput): PeriodRecord | null
  /**
   * Deletes ONE period. Its subjects survive with a NULL `period_id` (FK
   * `set null`), and the count is reported for the confirmation dialog.
   * Null if not found.
   */
  removePeriod(id: number): DeletePeriodResult | null
  /**
   * Deletes the program. Its periods cascade away; its subjects do NOT —
   * their `period_id` falls back to NULL (design: losing a period must not
   * destroy the work recorded under it). Null if not found.
   */
  remove(id: number): DeleteProgramResult | null
}

// SQLite has no enums, so the text columns are narrowed on the way out. An
// unrecognised value means the row was written by something other than the
// validated commands — that is corruption, and failing loudly beats quietly
// coercing it into a valid-looking program.
function toGradingScheme(value: string): GradingScheme {
  if (value === 'numerico' || value === 'binario') {
    return value
  }
  throw new Error(`Unknown gradingScheme "${value}"`)
}

function toOutcome(value: string | null): SubjectOutcome | null {
  if (value === null) {
    return null
  }
  if (value === 'aprobada' || value === 'reprobada' || value === 'finalPendiente') {
    return value
  }
  throw new Error(`Unknown subject outcome "${value}"`)
}

interface ProgramRow {
  id: number
  name: string
  institution: string | null
  color: string
  gradingScheme: string
  gradeScale: number | null
}

function toProgramRecord(row: ProgramRow): ProgramRecord {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    color: row.color,
    gradingScheme: toGradingScheme(row.gradingScheme),
    gradeScale: row.gradeScale
  }
}

/**
 * Whether `candidate` beats `current` as THE approved instance of a subject:
 * later taken_on first, null dates last, higher id on a tie. Total order over
 * distinct rows, so the pick never depends on query order.
 */
function ranksAboveApproved(
  candidate: { id: number; takenOn: string | null },
  current: { id: number; takenOn: string | null }
): boolean {
  if (candidate.takenOn !== current.takenOn) {
    if (candidate.takenOn === null) {
      return false
    }
    if (current.takenOn === null) {
      return true
    }
    return candidate.takenOn > current.takenOn
  }
  return candidate.id > current.id
}

/**
 * Loads periods and subject roll-ups for a set of programs in a FIXED number
 * of queries (four), never one per program — the Carreras screen renders
 * every program at once.
 */
function assemble(db: AppDatabase, programRows: ProgramRow[]): ProgramWithPeriods[] {
  if (programRows.length === 0) {
    return []
  }
  const programIds = programRows.map((program) => program.id)

  const periodRows = db.select().from(periods).where(inArray(periods.programId, programIds)).all()

  // A subject reaches its program THROUGH its period, so an unassigned
  // subject (period_id NULL) belongs to no program — which is exactly what
  // the inner join expresses.
  const subjectRows = db
    .select({
      id: subjects.id,
      grade: subjects.grade,
      outcome: subjects.outcome,
      programId: periods.programId
    })
    .from(subjects)
    .innerJoin(periods, eq(subjects.periodId, periods.id))
    .where(inArray(periods.programId, programIds))
    .all()

  // One approved instance per subject, picked DETERMINISTICALLY when the
  // data somehow holds several (nothing in the schema forbids it): the
  // latest taken_on wins, undated rows rank below any dated one, and a tie
  // breaks toward the highest id — never whichever row the query returned
  // first. The map's presence answers hasApprovedFinal; its grade ships as
  // the approvedFinalGrade fact.
  const approvedFinalBySubject = new Map<number, { id: number; takenOn: string | null; grade: number | null }>()
  for (const row of db
    .select({
      id: finalExams.id,
      subjectId: finalExams.subjectId,
      takenOn: finalExams.takenOn,
      grade: finalExams.grade
    })
    .from(finalExams)
    .where(eq(finalExams.result, 'aprobado'))
    .all()) {
    const current = approvedFinalBySubject.get(row.subjectId)
    if (!current || ranksAboveApproved(row, current)) {
      approvedFinalBySubject.set(row.subjectId, row)
    }
  }

  const periodsByProgram = new Map<number, PeriodRecord[]>()
  for (const row of periodRows) {
    const bucket = periodsByProgram.get(row.programId) ?? []
    bucket.push(row)
    periodsByProgram.set(row.programId, bucket)
  }

  const subjectsByProgram = new Map<number, GradedSubjectRecord[]>()
  for (const row of subjectRows) {
    const bucket = subjectsByProgram.get(row.programId) ?? []
    const approvedFinal = approvedFinalBySubject.get(row.id)
    bucket.push({
      grade: row.grade,
      outcome: toOutcome(row.outcome),
      hasApprovedFinal: approvedFinal !== undefined,
      approvedFinalGrade: approvedFinal?.grade ?? null
    })
    subjectsByProgram.set(row.programId, bucket)
  }

  return programRows.map((row) => {
    const gradedSubjects = subjectsByProgram.get(row.id) ?? []
    return {
      ...toProgramRecord(row),
      // Sorted by start date so the timeline and the chips read
      // chronologically without every caller re-sorting.
      periods: [...(periodsByProgram.get(row.id) ?? [])].sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
      subjectCount: gradedSubjects.length,
      gradedSubjects
    }
  })
}

/**
 * SQLite-backed implementation of the program/period port (design §2).
 *
 * Program is the aggregate root for periods: there is no standalone
 * period-creation command that does not name its program, the same rule that
 * makes ScheduleSlot subordinate to Subject.
 */
export function createSqliteProgramRepository(db: AppDatabase): ProgramRepository {
  return {
    create(input) {
      const inserted = db
        .insert(programs)
        .values({
          name: input.name,
          institution: input.institution,
          color: input.color,
          gradingScheme: input.gradingScheme,
          gradeScale: input.gradeScale
        })
        .returning()
        .get()
      return toProgramRecord(inserted)
    },
    list() {
      return assemble(db, db.select().from(programs).all())
    },
    detail(id) {
      const row = db.select().from(programs).where(eq(programs.id, id)).get()
      if (!row) {
        return null
      }
      return assemble(db, [row])[0] ?? null
    },
    update(input) {
      // `gradeScale` is SET explicitly rather than skipped when null: moving a
      // program to `binario` has to clear the old scale, not leave a stale 10
      // behind that would then read as a numeric program with no scheme.
      const updated = db
        .update(programs)
        .set({
          name: input.name,
          institution: input.institution,
          color: input.color,
          gradingScheme: input.gradingScheme,
          gradeScale: input.gradeScale
        })
        .where(eq(programs.id, input.id))
        .returning()
        .get()
      return updated ? toProgramRecord(updated) : null
    },
    createPeriod(input) {
      return db
        .insert(periods)
        .values({
          programId: input.programId,
          name: input.name,
          kind: input.kind,
          startsOn: input.startsOn,
          endsOn: input.endsOn
        })
        .returning()
        .get()
    },
    updatePeriod(input) {
      // `programId` is deliberately absent from the SET: a period does not
      // change carrera (see shared/ipc/carreras.ts's updatePeriodInputSchema).
      const updated = db
        .update(periods)
        .set({
          name: input.name,
          kind: input.kind,
          startsOn: input.startsOn,
          endsOn: input.endsOn
        })
        .where(eq(periods.id, input.id))
        .returning()
        .get()
      return updated ?? null
    },
    removePeriod(id) {
      const existing = db.select().from(periods).where(eq(periods.id, id)).get()
      if (!existing) {
        return null
      }

      // Counted BEFORE the delete, same reason as `remove` below: afterwards
      // the FK has already set these rows' period_id to NULL.
      const unlinkedSubjects = db
        .select({ id: subjects.id })
        .from(subjects)
        .where(eq(subjects.periodId, id))
        .all().length

      db.delete(periods).where(eq(periods.id, id)).run()

      return { id, unlinkedSubjects }
    },
    remove(id) {
      const existing = db.select().from(programs).where(eq(programs.id, id)).get()
      if (!existing) {
        return null
      }

      const periodIds = db
        .select({ id: periods.id })
        .from(periods)
        .where(eq(periods.programId, id))
        .all()
        .map((row) => row.id)

      // Counted BEFORE the delete: afterwards the FK has already set these
      // rows' period_id to NULL and they can no longer be found this way.
      const unlinkedSubjects =
        periodIds.length === 0
          ? 0
          : db.select({ id: subjects.id }).from(subjects).where(inArray(subjects.periodId, periodIds)).all().length

      db.delete(programs).where(eq(programs.id, id)).run()

      return { id, deletedPeriods: periodIds.length, unlinkedSubjects }
    }
  }
}
