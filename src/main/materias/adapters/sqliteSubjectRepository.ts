import { eq } from 'drizzle-orm'
import { validateGrade } from '../../../shared/domain/grading'
import type { DeadlineRecord } from '../../../shared/ipc/deadlines'
import type {
  AttendanceRecord,
  ClassNoteRecord,
  CreateSubjectInput,
  FinalExamRecord,
  FinalExamResult,
  PartialExamRecord,
  PartialExamResult,
  SetSubjectOutcomeInput,
  SubjectOutcome,
  SubjectPeriod,
  SubjectPrerequisite,
  SubjectProgram,
  SubjectRegularity,
  SubjectWithStatus,
  UpdateSubjectScheduleInput
} from '../../../shared/ipc/materias'
import { toAttendanceRecord } from '../../clases/adapters/sqliteClaseRepository'
// Correlativas are WRITTEN through `planificador:*` and READ here, on the
// subject payloads — the same split `clases:*` already makes. Both helpers are
// imported rather than restated so the level guard and the fact-only
// composition can never drift from the ones the write path applies.
import { composePrerequisites, toPrerequisiteLevel } from '../../planificador/adapters/sqlitePlannerRepository'
import type { AppDatabase } from '../../db/connection'
import {
  attendanceRecords,
  classNotes,
  deadlines,
  finalExams,
  partialExams,
  periods,
  programs,
  scheduleSlots,
  subjectPrerequisites,
  subjects
} from '../../db/schema'

export interface SlotRecord {
  id: number
  subjectId: number
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
  location: string | null
}

export interface SubjectRecord {
  id: number
  name: string
  code: string
  color: string
  docente: string | null
  contacto: string | null
  comision: string | null
  aula: string | null
  campusUrl: string | null
  groupUrl: string | null
  notas: string | null
  attendanceMinPercent: number | null
  periodId: number | null
  outcome: SubjectOutcome | null
  grade: number | null
  regularity: SubjectRegularity | null
}

export interface SubjectWithSlots extends SubjectRecord {
  slots: SlotRecord[]
}

export interface SubjectWithDetail extends SubjectWithSlots {
  deadlines: DeadlineRecord[]
  period: SubjectPeriod | null
  program: SubjectProgram | null
  finals: FinalExamRecord[]
  parciales: PartialExamRecord[]
  attendance: AttendanceRecord[]
  classNotes: ClassNoteRecord[]
  prerequisites: SubjectPrerequisite[]
}

export interface DeleteSubjectResult {
  deletedSlots: number
  deletedDeadlines: number
}

export interface SubjectRepository {
  create(input: CreateSubjectInput): SubjectWithSlots
  /**
   * Carries each subject's period and final-exam results so the renderer can
   * resolve its status. The STATUS itself is not computed here: it depends on
   * "today", which belongs to render time.
   */
  list(): SubjectWithStatus[]
  /** Aggregates subject + slots + deadlines (design §2). Null if not found. */
  detail(id: number): SubjectWithDetail | null
  /**
   * Atomic replace of BOTH the general subject fields AND the whole slot
   * set (design §2's aggregate-root rule: slots only move through
   * `materias:create`/`materias:updateSchedule`). No standalone slot
   * command exists.
   */
  updateSchedule(input: UpdateSubjectScheduleInput): SubjectWithSlots
  /**
   * Deletes ONLY the subject row — slots and deadlines are removed by
   * SQLite's `ON DELETE CASCADE`, which depends entirely on the connection
   * having `PRAGMA foreign_keys = ON` (connection.ts). Returns the
   * pre-delete child counts for the caller to report, or null if the
   * subject did not exist.
   */
  remove(id: number): DeleteSubjectResult | null
  /**
   * Records what happened with the subject once its period ended. Rejects a
   * grade the owning program's scheme does not admit (shared/domain/grading
   * .ts — the same rule the form applies, one implementation). Null if the
   * subject does not exist.
   */
  setOutcome(input: SetSubjectOutcomeInput): SubjectWithStatus | null
}

const OUTCOMES = new Set(['aprobada', 'reprobada', 'finalPendiente'])
const FINAL_RESULTS = new Set(['pendiente', 'aprobado', 'reprobado'])
const REGULARITIES = new Set(['regular', 'promocionada', 'libre'])
const PARTIAL_RESULTS = new Set(['pendiente', 'aprobado', 'reprobado'])

// SQLite has no enums; an unrecognised value means the row was written by
// something other than the validated commands, which is corruption worth
// failing on rather than coercing into a valid-looking state.
function toOutcome(value: string | null): SubjectOutcome | null {
  if (value === null) {
    return null
  }
  if (!OUTCOMES.has(value)) {
    throw new Error(`Unknown subject outcome "${value}"`)
  }
  return value as SubjectOutcome
}

function toFinalResult(value: string): FinalExamResult {
  if (!FINAL_RESULTS.has(value)) {
    throw new Error(`Unknown final exam result "${value}"`)
  }
  return value as FinalExamResult
}

// Same corruption-over-coercion rule as `toOutcome`: the condición is a
// closed set owned by Zod, and a stored value outside it means the row was
// written by something other than the validated commands.
function toRegularity(value: string | null): SubjectRegularity | null {
  if (value === null) {
    return null
  }
  if (!REGULARITIES.has(value)) {
    throw new Error(`Unknown subject regularity "${value}"`)
  }
  return value as SubjectRegularity
}

function toPartialResult(value: string): PartialExamResult {
  if (!PARTIAL_RESULTS.has(value)) {
    throw new Error(`Unknown partial exam result "${value}"`)
  }
  return value as PartialExamResult
}

/**
 * Every subject with the period and final-exam rows its status depends on,
 * in a FIXED four queries regardless of how many subjects there are — the
 * Materias screen renders them all at once.
 */
function listWithStatus(db: AppDatabase): SubjectWithStatus[] {
  const allSubjects = db.select().from(subjects).all()
  const allSlots = db.select().from(scheduleSlots).all()
  const allPeriods = db.select().from(periods).all()
  const allFinals = db.select().from(finalExams).all()

  const allPrograms = db.select().from(programs).all()
  const openDeadlines = db.select().from(deadlines).where(eq(deadlines.done, false)).all()
  // EDGES only here — no names, no required-subject state. This payload
  // already carries every subject's name, outcome, regularity and final
  // results, so a consumer resolves a requirement by looking the required
  // subject up in the SAME array. Denormalizing those facts into each edge
  // would ship them twice and give them two chances to disagree.
  const allPrerequisites = db.select().from(subjectPrerequisites).all()

  const periodsById = new Map<number, SubjectPeriod>(
    allPeriods.map((period) => [
      period.id,
      { id: period.id, name: period.name, startsOn: period.startsOn, endsOn: period.endsOn }
    ])
  )

  // Programs are keyed BY PERIOD id: the subject reaches its program through
  // its period, so this saves every caller from walking the chain again.
  const programsByPeriodId = new Map<number, SubjectProgram>()
  for (const period of allPeriods) {
    const program = allPrograms.find((candidate) => candidate.id === period.programId)
    if (program) {
      programsByPeriodId.set(period.id, {
        id: program.id,
        name: program.name,
        gradingScheme: program.gradingScheme === 'binario' ? 'binario' : 'numerico',
        gradeScale: program.gradeScale
      })
    }
  }

  return allSubjects.map((subject) => ({
    ...subject,
    outcome: toOutcome(subject.outcome),
    regularity: toRegularity(subject.regularity),
    slots: allSlots.filter((slot) => slot.subjectId === subject.id),
    period: subject.periodId === null ? null : (periodsById.get(subject.periodId) ?? null),
    program: subject.periodId === null ? null : (programsByPeriodId.get(subject.periodId) ?? null),
    finals: allFinals
      .filter((final) => final.subjectId === subject.id)
      .map((final) => ({ result: toFinalResult(final.result) })),
    pendingDeadlines: openDeadlines.filter((deadline) => deadline.subjectId === subject.id).length,
    prerequisites: allPrerequisites
      .filter((prerequisite) => prerequisite.subjectId === subject.id)
      .map((prerequisite) => ({
        requiresSubjectId: prerequisite.requiresSubjectId,
        requiredLevel: toPrerequisiteLevel(prerequisite.requiredLevel)
      }))
  }))
}

/**
 * SQLite-backed implementation of the subject-registry port (design §2,
 * §4). Subject is the aggregate root: `create` is the ONLY way slots ever
 * get written, and it writes the subject plus all of its slots in a single
 * transaction (spec: "Subject Creation Transaction" — atomic rollback on
 * an invalid slot).
 */
export function createSqliteSubjectRepository(db: AppDatabase): SubjectRepository {
  return {
    create(input) {
      return db.transaction((tx) => {
        for (const slot of input.slots) {
          if (slot.endMinutes <= slot.startMinutes) {
            throw new Error(
              `Invalid schedule slot: endMinutes (${slot.endMinutes}) must be after startMinutes (${slot.startMinutes})`
            )
          }
        }

        const insertedSubject = tx
          .insert(subjects)
          .values({
            name: input.name,
            code: input.code,
            color: input.color,
            docente: input.docente ?? null,
            contacto: input.contacto ?? null,
            periodId: input.periodId ?? null
          })
          .returning()
          .get()

        const insertedSlots = input.slots.map((slot) =>
          tx
            .insert(scheduleSlots)
            .values({
              subjectId: insertedSubject.id,
              dayOfWeek: slot.dayOfWeek,
              startMinutes: slot.startMinutes,
              endMinutes: slot.endMinutes,
              location: slot.location ?? null
            })
            .returning()
            .get()
        )

        return {
          ...insertedSubject,
          outcome: toOutcome(insertedSubject.outcome),
          regularity: toRegularity(insertedSubject.regularity),
          slots: insertedSlots
        }
      })
    },
    list() {
      return listWithStatus(db)
    },
    detail(id) {
      const subject = db.select().from(subjects).where(eq(subjects.id, id)).get()
      if (!subject) {
        return null
      }
      const slots = db.select().from(scheduleSlots).where(eq(scheduleSlots.subjectId, id)).all()
      const subjectDeadlines = db.select().from(deadlines).where(eq(deadlines.subjectId, id)).all()
      // Reuses the list projection for period/program rather than repeating
      // the period→program walk, so the two payloads can never disagree
      // about which program a subject belongs to.
      const fromList = listWithStatus(db).find((candidate) => candidate.id === id)
      return {
        ...subject,
        outcome: toOutcome(subject.outcome),
        regularity: toRegularity(subject.regularity),
        slots,
        deadlines: subjectDeadlines,
        period: fromList?.period ?? null,
        program: fromList?.program ?? null,
        finals: db
          .select()
          .from(finalExams)
          .where(eq(finalExams.subjectId, id))
          .all()
          .map((final) => ({ ...final, result: toFinalResult(final.result) })),
        // Joined into the subject READ rather than served by a
        // `parciales:list` channel — exactly how `finals` travels, and for
        // the same reason: the only screen that shows them has already
        // fetched the subject.
        parciales: db
          .select()
          .from(partialExams)
          .where(eq(partialExams.subjectId, id))
          .all()
          .map((parcial) => ({ ...parcial, result: toPartialResult(parcial.result) })),
        // Attendance marks and class apuntes join the subject READ for the
        // same reason finals and parciales do: `clases:*` ships writes only,
        // and the screen that shows them has already fetched the subject.
        //
        // The rows are returned RAW — no percentage, no "12 de 14", no
        // resolved class occurrence. Which slot a marked date fell on is
        // composed at render time by crossing the date with the slots then in
        // effect, and the percentage is a pure renderer-domain function; both
        // would be answers baked into a cached payload that the next horario
        // edit could contradict.
        attendance: db
          .select()
          .from(attendanceRecords)
          .where(eq(attendanceRecords.subjectId, id))
          .all()
          .map(toAttendanceRecord),
        classNotes: db.select().from(classNotes).where(eq(classNotes.subjectId, id)).all(),
        // FULL records here, unlike the list's edge projection: the
        // CORRELATIVAS card prints the required materia's NAME and the edit
        // field removes rows by id — neither of which an edge can supply.
        prerequisites: composePrerequisites(
          db,
          db.select().from(subjectPrerequisites).where(eq(subjectPrerequisites.subjectId, id)).all()
        )
      }
    },
    updateSchedule(input) {
      return db.transaction((tx) => {
        for (const slot of input.slots) {
          if (slot.endMinutes <= slot.startMinutes) {
            throw new Error(
              `Invalid schedule slot: endMinutes (${slot.endMinutes}) must be after startMinutes (${slot.startMinutes})`
            )
          }
        }

        const updatedSubject = tx
          .update(subjects)
          .set({
            name: input.name,
            code: input.code,
            color: input.color,
            docente: input.docente ?? null,
            contacto: input.contacto ?? null,
            comision: input.comision ?? null,
            aula: input.aula ?? null,
            campusUrl: input.campusUrl ?? null,
            groupUrl: input.groupUrl ?? null,
            notas: input.notas ?? null,
            attendanceMinPercent: input.attendanceMinPercent ?? null,
            periodId: input.periodId ?? null,
            // Written ONLY when the key is present — note `!== undefined`,
            // not the `?? null` every other optional field here uses.
            //
            // Those fields all come from the "Editar materia" form, which
            // always sends them, so an absent one really does mean "cleared".
            // The condición has NO editing surface yet: it is absent from
            // every payload this command currently receives, and `?? null`
            // would make saving an unrelated field silently erase the
            // cátedra's verdict. Absent means "not mentioned"; an explicit
            // `null` is what withdraws a declaration.
            ...(input.regularity !== undefined ? { regularity: input.regularity } : {})
          })
          .where(eq(subjects.id, input.id))
          .returning()
          .get()

        // Atomic slot-set REPLACE, not a per-slot diff/patch: the whole set
        // is deleted and reinserted in the same transaction.
        tx.delete(scheduleSlots).where(eq(scheduleSlots.subjectId, input.id)).run()

        const insertedSlots = input.slots.map((slot) =>
          tx
            .insert(scheduleSlots)
            .values({
              subjectId: input.id,
              dayOfWeek: slot.dayOfWeek,
              startMinutes: slot.startMinutes,
              endMinutes: slot.endMinutes,
              location: slot.location ?? null
            })
            .returning()
            .get()
        )

        return {
          ...updatedSubject,
          outcome: toOutcome(updatedSubject.outcome),
          regularity: toRegularity(updatedSubject.regularity),
          slots: insertedSlots
        }
      })
    },
    remove(id) {
      return db.transaction((tx) => {
        const subject = tx.select().from(subjects).where(eq(subjects.id, id)).get()
        if (!subject) {
          return null
        }

        const slotsToDelete = tx.select().from(scheduleSlots).where(eq(scheduleSlots.subjectId, id)).all()
        const deadlinesToDelete = tx.select().from(deadlines).where(eq(deadlines.subjectId, id)).all()

        // ONLY the subject row is deleted here. Slots and deadlines are
        // removed by the FK's `ON DELETE CASCADE` — this is deliberate:
        // deleting them explicitly here would mask a pragma regression
        // instead of surfacing it (see connection.test.ts and this
        // repository's "remove (cascade delete)" tests).
        tx.delete(subjects).where(eq(subjects.id, id)).run()

        return { deletedSlots: slotsToDelete.length, deletedDeadlines: deadlinesToDelete.length }
      })
    },
    setOutcome(input) {
      const subject = db.select().from(subjects).where(eq(subjects.id, input.id)).get()
      if (!subject) {
        return null
      }

      // The grade's legality belongs to the PROGRAM, which is reached
      // through the period. A subject with no period has no program to ask,
      // so it cannot carry a grade either — there is no scale to check
      // against, and inventing a default one would be guessing.
      const program =
        subject.periodId === null
          ? null
          : (db
              .select({ gradingScheme: programs.gradingScheme, gradeScale: programs.gradeScale })
              .from(periods)
              .innerJoin(programs, eq(periods.programId, programs.id))
              .where(eq(periods.id, subject.periodId))
              .get() ?? null)

      if (input.grade !== null) {
        if (program === null) {
          throw new Error('Cannot grade a subject that does not belong to a program')
        }
        const validation = validateGrade(
          {
            gradingScheme: program.gradingScheme === 'binario' ? 'binario' : 'numerico',
            gradeScale: program.gradeScale
          },
          input.grade
        )
        if (!validation.ok) {
          throw new Error(validation.error)
        }
      }

      db.update(subjects).set({ outcome: input.outcome, grade: input.grade }).where(eq(subjects.id, input.id)).run()

      return listWithStatus(db).find((candidate) => candidate.id === input.id) ?? null
    }
  }
}
