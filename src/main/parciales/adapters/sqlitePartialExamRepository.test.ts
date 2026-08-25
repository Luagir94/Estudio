import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { partialExams, periods, programs, subjects } from '../../db/schema'
import { createSqlitePartialExamRepository } from './sqlitePartialExamRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

function createTestDb() {
  const { db } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

describe('createSqlitePartialExamRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repository: ReturnType<typeof createSqlitePartialExamRepository>
  let subjectId: number

  beforeEach(() => {
    db = createTestDb()
    repository = createSqlitePartialExamRepository(db)
    subjectId = db
      .insert(subjects)
      .values({ name: 'Análisis Matemático', code: 'AM-101', color: '#fff' })
      .returning()
      .get().id
  })

  it('creates a parcial that defaults to pendiente', () => {
    const created = repository.create({
      subjectId,
      label: '1er parcial',
      takenOn: '2026-05-12',
      result: 'pendiente',
      grade: null
    })

    expect(created).toMatchObject({ label: '1er parcial', takenOn: '2026-05-12', result: 'pendiente', grade: null })
  })

  // The whole reason the column is nullable: a parcial exists before the
  // cátedra publishes its date.
  it('creates a parcial with no date yet', () => {
    const created = repository.create({
      subjectId,
      label: 'Recuperatorio 1',
      takenOn: null,
      result: 'pendiente',
      grade: null
    })

    expect(created.takenOn).toBeNull()
  })

  it('lists only the parciales of the given subject', () => {
    const other = db.insert(subjects).values({ name: 'Otra', code: 'O-1', color: '#fff' }).returning().get()
    repository.create({ subjectId, label: '1er parcial', takenOn: null, result: 'pendiente', grade: null })
    repository.create({ subjectId: other.id, label: 'ajeno', takenOn: null, result: 'pendiente', grade: null })

    expect(repository.listBySubject(subjectId).map((parcial) => parcial.label)).toEqual(['1er parcial'])
  })

  it('records how a parcial went', () => {
    const created = repository.create({
      subjectId,
      label: '1er parcial',
      takenOn: null,
      result: 'pendiente',
      grade: null
    })

    const updated = repository.update({
      id: created.id,
      label: '1er parcial',
      takenOn: '2026-05-12',
      result: 'reprobado',
      grade: null
    })

    expect(updated).toMatchObject({ result: 'reprobado', takenOn: '2026-05-12' })
  })

  // Regularity is STORED, never derived: no arrangement of parciales may
  // write it. This is the guard that keeps the app from legislating rules
  // only the cátedra owns.
  it('never writes the subject regularity itself', () => {
    const created = repository.create({
      subjectId,
      label: '1er parcial',
      takenOn: null,
      result: 'pendiente',
      grade: null
    })

    repository.update({ id: created.id, label: '1er parcial', takenOn: null, result: 'aprobado', grade: null })

    expect(db.select().from(subjects).all()[0]!.regularity).toBeNull()
  })

  it('returns null when updating an unknown parcial', () => {
    expect(repository.update({ id: 999, label: 'x', takenOn: null, result: 'pendiente', grade: null })).toBeNull()
  })

  it('deletes a parcial', () => {
    const created = repository.create({
      subjectId,
      label: '1er parcial',
      takenOn: null,
      result: 'pendiente',
      grade: null
    })

    expect(repository.remove(created.id)).toBe(true)
    expect(repository.listBySubject(subjectId)).toHaveLength(0)
  })

  it('reports a delete of an unknown parcial', () => {
    expect(repository.remove(999)).toBe(false)
  })

  it('cascade-deletes parciales with their subject', () => {
    repository.create({ subjectId, label: '1er parcial', takenOn: null, result: 'pendiente', grade: null })

    db.delete(subjects).run()

    expect(db.select().from(partialExams).all()).toHaveLength(0)
  })

  // SQLite has no enums: an unrecognised stored value means the row was
  // written by something other than the validated commands.
  it('throws on an unknown stored result', () => {
    const created = repository.create({
      subjectId,
      label: '1er parcial',
      takenOn: null,
      result: 'pendiente',
      grade: null
    })
    db.update(partialExams).set({ result: 'ausente' }).where(eq(partialExams.id, created.id)).run()

    expect(() => repository.listBySubject(subjectId)).toThrow(/Unknown partial exam result/)
  })
})

// The nota of a parcial follows the SAME cross-entity rule subjects.grade and
// final_exams.grade follow (shared/domain/grading.ts): the grade lives on the
// parcial, its legality is decided by the program reached through the period.
describe('createSqlitePartialExamRepository — grade', () => {
  let db: ReturnType<typeof createTestDb>
  let repository: ReturnType<typeof createSqlitePartialExamRepository>
  let numericSubjectId: number
  let binarySubjectId: number
  let orphanSubjectId: number

  beforeEach(() => {
    db = createTestDb()
    repository = createSqlitePartialExamRepository(db)

    const numericProgram = db
      .insert(programs)
      .values({ name: 'Ingeniería', color: '#fff', gradingScheme: 'numerico', gradeScale: 10 })
      .returning()
      .get()
    const binaryProgram = db
      .insert(programs)
      .values({ name: 'Curso de Bartender', color: '#fff', gradingScheme: 'binario', gradeScale: null })
      .returning()
      .get()
    const numericPeriod = db
      .insert(periods)
      .values({ programId: numericProgram.id, name: '1er 2026', kind: 'cuatrimestre', startsOn: '2026-03-09' })
      .returning()
      .get()
    const binaryPeriod = db
      .insert(periods)
      .values({ programId: binaryProgram.id, name: 'Clases', kind: 'curso', startsOn: '2026-03-09' })
      .returning()
      .get()

    const subject = (name: string, code: string, periodId: number | null) =>
      db.insert(subjects).values({ name, code, color: '#fff', periodId }).returning().get().id
    numericSubjectId = subject('Análisis Matemático', 'AM-101', numericPeriod.id)
    binarySubjectId = subject('Coctelería', 'CO-1', binaryPeriod.id)
    orphanSubjectId = subject('Suelta', 'X-1', null)
  })

  function parcial(subjectId: number, grade: number | null = null) {
    return repository.create({ subjectId, label: '1er parcial', takenOn: '2026-05-12', result: 'aprobado', grade })
  }

  it('persists the nota of a parcial under a numeric program', () => {
    expect(parcial(numericSubjectId, 8).grade).toBe(8)
  })

  it('records a parcial with no nota — "aprobado sin nota" is a legitimate state', () => {
    expect(parcial(numericSubjectId, null).grade).toBeNull()
  })

  // Unlike a mesa de final, the nota is NOT approved-only: a reprobado 3 is
  // exactly the number the cátedra wrote down.
  it('keeps a nota on a reprobado parcial', () => {
    const created = parcial(numericSubjectId, null)

    const updated = repository.update({
      id: created.id,
      label: created.label,
      takenOn: created.takenOn,
      result: 'reprobado',
      grade: 3
    })

    expect(updated).toMatchObject({ result: 'reprobado', grade: 3 })
  })

  it('rejects a nota over the program scale on create', () => {
    expect(() => parcial(numericSubjectId, 11)).toThrow(/between 0 and 10/)
  })

  it('rejects a nota over the program scale on update', () => {
    const created = parcial(numericSubjectId, null)

    expect(() =>
      repository.update({
        id: created.id,
        label: created.label,
        takenOn: created.takenOn,
        result: 'aprobado',
        grade: 11
      })
    ).toThrow(/between 0 and 10/)
  })

  it('rejects a nota under a pass/fail program', () => {
    expect(() => parcial(binarySubjectId, 8)).toThrow(/pass\/fail/)
  })

  it('records a parcial with no nota under a pass/fail program', () => {
    expect(parcial(binarySubjectId, null).grade).toBeNull()
  })

  it('rejects a nota for a subject outside any program — no scale to check against', () => {
    expect(() => parcial(orphanSubjectId, 8)).toThrow(/program/)
  })
})
