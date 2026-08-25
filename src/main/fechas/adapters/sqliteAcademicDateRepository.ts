import { asc, eq } from 'drizzle-orm'
import type {
  AcademicDateKind,
  AcademicDateRecord,
  AcademicDateWithProgram,
  CreateAcademicDateInput,
  UpdateAcademicDateInput
} from '../../../shared/ipc/fechas'
import type { AppDatabase } from '../../db/connection'
import { academicDates, programs } from '../../db/schema'

export interface AcademicDateRepository {
  create(input: CreateAcademicDateInput): AcademicDateRecord
  /** Every carrera's dates, chronological. Filtering is a rendering-time question (see shared/ipc/fechas.ts). */
  list(): AcademicDateWithProgram[]
  listByProgram(programId: number): AcademicDateWithProgram[]
  /** Null if not found. */
  update(input: UpdateAcademicDateInput): AcademicDateRecord | null
  remove(id: number): boolean
}

const KINDS = new Set(['inscripcionFinales', 'inscripcionCursadas', 'vencimientoRegularidad', 'otro'])

const PROGRAM_JOIN_COLUMNS = {
  id: academicDates.id,
  programId: academicDates.programId,
  title: academicDates.title,
  kind: academicDates.kind,
  startsOn: academicDates.startsOn,
  endsOn: academicDates.endsOn,
  programName: programs.name
}

// The closed set is Zod's (shared/ipc/fechas.ts), not SQL's, so a row read
// back from the file is the one place an unknown kind could appear — from a
// hand-edited database or a downgrade. Failing loudly here beats handing the
// renderer a record its own schema will reject with no explanation, the same
// guard `sqliteFinalExamRepository` puts on `result`.
function assertKind(kind: string): AcademicDateKind {
  if (!KINDS.has(kind)) {
    throw new Error(`Unknown academic date kind "${kind}"`)
  }
  return kind as AcademicDateKind
}

function toRecord(row: {
  id: number
  programId: number
  title: string
  kind: string
  startsOn: string
  endsOn: string | null
}): AcademicDateRecord {
  return { ...row, kind: assertKind(row.kind) }
}

function toRecordWithProgram(row: {
  id: number
  programId: number
  title: string
  kind: string
  startsOn: string
  endsOn: string | null
  programName: string
}): AcademicDateWithProgram {
  return { ...row, kind: assertKind(row.kind) }
}

/**
 * SQLite-backed implementation of the administrative-date port.
 *
 * Note what is NOT here: any notion of completion. A trámite is upcoming or
 * past by the calendar (see the table's own comment in `db/schema.ts`), so
 * there is no `setDone` twin of `entregas:setDone` to write — the clock does
 * that write, and it does it for free.
 */
export function createSqliteAcademicDateRepository(db: AppDatabase): AcademicDateRepository {
  function selectWithProgram() {
    return db
      .select(PROGRAM_JOIN_COLUMNS)
      .from(academicDates)
      .innerJoin(programs, eq(academicDates.programId, programs.id))
  }

  return {
    create(input) {
      return toRecord(
        db
          .insert(academicDates)
          .values({
            programId: input.programId,
            title: input.title,
            kind: input.kind,
            startsOn: input.startsOn,
            endsOn: input.endsOn
          })
          .returning()
          .get()
      )
    },
    list() {
      // Ordered in SQL rather than the renderer because "chronological" is a
      // property of the data, not of the moment it is read — every surface
      // that consumes this list wants the same order underneath its own
      // grouping.
      return selectWithProgram()
        .orderBy(asc(academicDates.startsOn), asc(academicDates.id))
        .all()
        .map(toRecordWithProgram)
    },
    listByProgram(programId) {
      return selectWithProgram()
        .where(eq(academicDates.programId, programId))
        .orderBy(asc(academicDates.startsOn), asc(academicDates.id))
        .all()
        .map(toRecordWithProgram)
    },
    update(input) {
      // `programId` is untouched on purpose — the update command does not
      // carry one (shared/ipc/fechas.ts): a date never changes carrera.
      const updated = db
        .update(academicDates)
        .set({
          title: input.title,
          kind: input.kind,
          startsOn: input.startsOn,
          endsOn: input.endsOn
        })
        .where(eq(academicDates.id, input.id))
        .returning()
        .get()
      return updated ? toRecord(updated) : null
    },
    remove(id) {
      const existing = db.select().from(academicDates).where(eq(academicDates.id, id)).get()
      if (!existing) {
        return false
      }
      db.delete(academicDates).where(eq(academicDates.id, id)).run()
      return true
    }
  }
}
