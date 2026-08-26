import { and, eq } from 'drizzle-orm'
import type { PrerequisiteEdge } from '../../../shared/domain/prerequisiteGraph'
import type {
  FinalExamResult,
  PrerequisiteLevel,
  SubjectOutcome,
  SubjectPrerequisite,
  SubjectRegularity
} from '../../../shared/ipc/materias'
import type {
  AddPrerequisiteInput,
  PlannerEntryInput,
  PlannerEntryRecord,
  UpdatePrerequisiteInput
} from '../../../shared/ipc/planificador'
import type { AppDatabase } from '../../db/connection'
import { finalExams, plannerEntries, subjectPrerequisites, subjects } from '../../db/schema'

/**
 * The write port for correlativas and for the próximo-período draft.
 *
 * Two concerns behind one repository because they are two halves of ONE
 * feature and share nothing with anything else: the rules decide what the
 * draft is allowed to contain, and the draft is the only thing that reads the
 * rules across subjects.
 *
 * `listPrerequisiteEdges` exists for the CYCLE GUARD and nothing else, which
 * is why it returns bare edges: `shared/domain/prerequisiteGraph.ts` is a
 * graph rule, and handing it names, levels or subject rows would be handing it
 * facts it must not be allowed to depend on.
 *
 * There is deliberately NO method that writes `subjects.period_id` from a
 * draft line. See the `planner_entries` comment in `db/schema.ts`: drafting is
 * not enrolling, and this app does not offer to blur the two.
 */
export interface PlannerRepository {
  /** Every stored edge, for the acyclicity check. Bare pairs — no levels, no names. */
  listPrerequisiteEdges(): PrerequisiteEdge[]
  /** The full records for one subject, as the detail payload and the edit field need them. */
  listPrerequisitesBySubject(subjectId: number): SubjectPrerequisite[]
  /** Records the rule, or CORRECTS the level if the pair already had one. Returns the stored row either way. */
  addPrerequisite(input: AddPrerequisiteInput): SubjectPrerequisite
  /** Changes only the level. Null if the row does not exist. */
  updatePrerequisite(input: UpdatePrerequisiteInput): SubjectPrerequisite | null
  /** Removes the rule. False if there was nothing to remove. */
  removePrerequisite(id: number): boolean
  /** Every draft line, across every período — filtering is the screen's job. */
  listEntries(): PlannerEntryRecord[]
  /** Puts the materia in that período's draft. Idempotent: asking twice is the same request. */
  addEntry(input: PlannerEntryInput): PlannerEntryRecord
  /** Takes it back out. False if it was not in the draft. */
  removeEntry(input: PlannerEntryInput): boolean
}

const LEVELS = new Set(['regularizada', 'aprobada'])
const OUTCOMES = new Set(['aprobada', 'reprobada', 'finalPendiente'])
const REGULARITIES = new Set(['regular', 'promocionada', 'libre'])
const FINAL_RESULTS = new Set(['pendiente', 'aprobado', 'reprobado'])

/**
 * SQLite has no enums; an unrecognised value means the row was written by
 * something other than the validated commands, which is corruption worth
 * failing on rather than coercing into a valid-looking state. Same guard
 * `toAttendanceRecord` applies to `attendance_records.status`.
 *
 * Exported because `sqliteSubjectRepository` joins these rows into the subject
 * payloads and must apply the IDENTICAL guard — the same reason it imports
 * `toAttendanceRecord` rather than restating that check.
 */
export function toPrerequisiteLevel(value: string): PrerequisiteLevel {
  if (!LEVELS.has(value)) {
    throw new Error(`Unknown prerequisite level "${value}"`)
  }
  return value as PrerequisiteLevel
}

function toOutcome(value: string | null): SubjectOutcome | null {
  if (value === null) {
    return null
  }
  if (!OUTCOMES.has(value)) {
    throw new Error(`Unknown subject outcome "${value}"`)
  }
  return value as SubjectOutcome
}

function toRegularity(value: string | null): SubjectRegularity | null {
  if (value === null) {
    return null
  }
  if (!REGULARITIES.has(value)) {
    throw new Error(`Unknown subject regularity "${value}"`)
  }
  return value as SubjectRegularity
}

function toFinalResult(value: string): FinalExamResult {
  if (!FINAL_RESULTS.has(value)) {
    throw new Error(`Unknown final exam result "${value}"`)
  }
  return value as FinalExamResult
}

/**
 * Composes the full correlativa records for a set of raw edge rows.
 *
 * Ships FACTS about the required subject — name, outcome, regularity, final
 * results — and no verdict. Whether the requirement is MET is a domain rule
 * (`renderer/planificador/domain/requirements.ts`), and answering it in SQL
 * would put a second copy of that rule in main, free to drift. Same call
 * `carreras`' `gradedSubjects` already makes.
 *
 * Exported so `sqliteSubjectRepository` builds the detail payload's
 * `prerequisites` through this exact function instead of a second, parallel
 * join that could disagree with it.
 */
export function composePrerequisites(
  db: AppDatabase,
  rows: { id: number; subjectId: number; requiresSubjectId: number; requiredLevel: string }[]
): SubjectPrerequisite[] {
  if (rows.length === 0) {
    return []
  }

  // Two unfiltered reads rather than one query per edge: a plan de estudios
  // has tens of subjects, not thousands, and the Planificador asks this
  // question about every subject at once (same fixed-query-count reasoning as
  // `listWithStatus`).
  const allSubjects = db.select().from(subjects).all()
  const allFinals = db.select().from(finalExams).all()

  return rows.map((row) => {
    const required = allSubjects.find((candidate) => candidate.id === row.requiresSubjectId)
    if (!required) {
      // Unreachable through the FK, which cascades rather than orphaning. If it
      // ever happens the database lost its referential integrity, and inventing
      // a placeholder subject would hide that behind a plausible-looking row.
      throw new Error(`Prerequisite ${row.id} names missing subject ${row.requiresSubjectId}`)
    }
    return {
      id: row.id,
      subjectId: row.subjectId,
      requiredLevel: toPrerequisiteLevel(row.requiredLevel),
      requires: {
        id: required.id,
        name: required.name,
        outcome: toOutcome(required.outcome),
        regularity: toRegularity(required.regularity),
        finals: allFinals
          .filter((final) => final.subjectId === required.id)
          .map((final) => ({ result: toFinalResult(final.result) }))
      }
    }
  })
}

/**
 * SQLite-backed implementation of the planner port.
 *
 * Note what is NOT here: any acyclicity check. That is a rule about the whole
 * edge set, it is needed identically by the picker in the renderer, and it is
 * pure — so it lives in `shared/domain/prerequisiteGraph.ts` and the handler
 * runs it against `listPrerequisiteEdges()` before calling `addPrerequisite`.
 * A copy of it in SQL, or in a trigger, would be a second implementation with
 * no way to test the two together.
 */
export function createSqlitePlannerRepository(db: AppDatabase): PlannerRepository {
  return {
    listPrerequisiteEdges() {
      return db
        .select({
          subjectId: subjectPrerequisites.subjectId,
          requiresSubjectId: subjectPrerequisites.requiresSubjectId
        })
        .from(subjectPrerequisites)
        .all()
    },
    listPrerequisitesBySubject(subjectId) {
      return composePrerequisites(
        db,
        db.select().from(subjectPrerequisites).where(eq(subjectPrerequisites.subjectId, subjectId)).all()
      )
    },
    addPrerequisite(input) {
      // The upsert rides the SAME unique index the contract is stated on, so
      // "one edge per pair, at one level" is enforced by the database rather
      // than by a read-then-write in application code. A second write of the
      // same pair is a CORRECTION of the level — the alternative would be
      // erroring about a rule the caller is already asking for.
      const row = db
        .insert(subjectPrerequisites)
        .values({
          subjectId: input.subjectId,
          requiresSubjectId: input.requiresSubjectId,
          requiredLevel: input.requiredLevel
        })
        .onConflictDoUpdate({
          target: [subjectPrerequisites.subjectId, subjectPrerequisites.requiresSubjectId],
          set: { requiredLevel: input.requiredLevel }
        })
        .returning()
        .get()

      // Non-null by construction: the row was just written in this statement.
      return composePrerequisites(db, [row])[0] as SubjectPrerequisite
    },
    updatePrerequisite(input) {
      const updated = db
        .update(subjectPrerequisites)
        .set({ requiredLevel: input.requiredLevel })
        .where(eq(subjectPrerequisites.id, input.id))
        .returning()
        .get()
      // `.returning().get()` yields undefined when the WHERE matched nothing,
      // which is the only way this row can be missing — so null here means
      // "no such rule", and the handler turns it into NOT_FOUND.
      return updated ? (composePrerequisites(db, [updated])[0] ?? null) : null
    },
    removePrerequisite(id) {
      return db.delete(subjectPrerequisites).where(eq(subjectPrerequisites.id, id)).returning().all().length > 0
    },
    listEntries() {
      return db.select().from(plannerEntries).all()
    },
    addEntry(input) {
      const inserted = db
        .insert(plannerEntries)
        .values({ periodId: input.periodId, subjectId: input.subjectId })
        // `DO NOTHING`, not `DO UPDATE`: unlike a correlativa's level there is
        // nothing to correct — a draft line has no payload beyond the pair it
        // IS. The existing row is then read back so the caller always gets a
        // record, never a null that means "it was already there".
        .onConflictDoNothing({ target: [plannerEntries.periodId, plannerEntries.subjectId] })
        .returning()
        .get()
      if (inserted) {
        return inserted
      }
      // Non-null: the insert was refused, which only happens because the pair
      // already exists.
      return db
        .select()
        .from(plannerEntries)
        .where(and(eq(plannerEntries.periodId, input.periodId), eq(plannerEntries.subjectId, input.subjectId)))
        .get() as PlannerEntryRecord
    },
    removeEntry(input) {
      return (
        db
          .delete(plannerEntries)
          .where(and(eq(plannerEntries.periodId, input.periodId), eq(plannerEntries.subjectId, input.subjectId)))
          .returning()
          .all().length > 0
      )
    }
  }
}
