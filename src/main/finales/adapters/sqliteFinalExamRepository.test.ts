import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { finalExams, periods, programs, subjects } from '../../db/schema'
import { createSqliteFinalExamRepository } from './sqliteFinalExamRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

function createTestDb() {
  const { db } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

describe('createSqliteFinalExamRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repository: ReturnType<typeof createSqliteFinalExamRepository>
  let subjectId: number

  beforeEach(() => {
    db = createTestDb()
    repository = createSqliteFinalExamRepository(db)
    subjectId = db
      .insert(subjects)
      .values({ name: 'Teoría del Estado', code: 'TE-103', color: '#fff', outcome: 'finalPendiente' })
      .returning()
      .get().id
  })

  it('creates an instance that defaults to pendiente', () => {
    const created = repository.create({ subjectId, label: '1ra mesa', takenOn: '2026-08-05', result: 'pendiente' })

    expect(created).toMatchObject({ label: '1ra mesa', takenOn: '2026-08-05', result: 'pendiente' })
  })

  // The whole reason the column is nullable.
  it('creates an instance with no date yet', () => {
    const created = repository.create({ subjectId, label: '3ra mesa', takenOn: null, result: 'pendiente' })

    expect(created.takenOn).toBeNull()
  })

  it('lists only the instances of the given subject', () => {
    const other = db.insert(subjects).values({ name: 'Otra', code: 'O-1', color: '#fff' }).returning().get()
    repository.create({ subjectId, label: '1ra', takenOn: null, result: 'pendiente' })
    repository.create({ subjectId: other.id, label: 'ajena', takenOn: null, result: 'pendiente' })

    expect(repository.listBySubject(subjectId).map((final) => final.label)).toEqual(['1ra'])
  })

  it('records how an instance went', () => {
    const created = repository.create({ subjectId, label: '1ra', takenOn: null, result: 'pendiente' })

    const updated = repository.update({
      id: created.id,
      label: '1ra',
      takenOn: '2026-08-05',
      result: 'reprobado',
      grade: null
    })

    expect(updated).toMatchObject({ result: 'reprobado', takenOn: '2026-08-05' })
  })

  // Recording a result must never touch the subject: its state is DERIVED.
  it('never writes the subject outcome itself', () => {
    const created = repository.create({ subjectId, label: '1ra', takenOn: null, result: 'pendiente' })

    repository.update({ id: created.id, label: '1ra', takenOn: null, result: 'reprobado', grade: null })

    expect(db.select().from(subjects).all()[0]!.outcome).toBe('finalPendiente')
  })

  it('returns null when updating an unknown instance', () => {
    expect(repository.update({ id: 999, label: 'x', takenOn: null, result: 'pendiente', grade: null })).toBeNull()
  })

  it('deletes an instance', () => {
    const created = repository.create({ subjectId, label: '1ra', takenOn: null, result: 'pendiente' })

    expect(repository.remove(created.id)).toBe(true)
    expect(repository.listBySubject(subjectId)).toHaveLength(0)
  })

  it('reports a delete of an unknown instance', () => {
    expect(repository.remove(999)).toBe(false)
  })

  it('cascade-deletes instances with their subject', () => {
    repository.create({ subjectId, label: '1ra', takenOn: null, result: 'pendiente' })

    db.delete(subjects).run()

    expect(repository.listBySubject(subjectId)).toHaveLength(0)
  })
})

// The nota of a mesa: valid only on an APPROVED instance of a subject whose
// program grades 'numerico' — the same cross-entity rule subjects.grade
// follows (shared/domain/grading.ts), enforced at this write boundary the
// same way sqliteSubjectRepository.setOutcome enforces it.
describe('createSqliteFinalExamRepository — grade', () => {
  let db: ReturnType<typeof createTestDb>
  let repository: ReturnType<typeof createSqliteFinalExamRepository>
  let numericSubjectId: number
  let binarySubjectId: number
  let orphanSubjectId: number

  beforeEach(() => {
    db = createTestDb()
    repository = createSqliteFinalExamRepository(db)

    const numericProgram = db
      .insert(programs)
      .values({ name: 'Abogacía', color: '#fff', gradingScheme: 'numerico', gradeScale: 10 })
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
      db.insert(subjects).values({ name, code, color: '#fff', periodId, outcome: 'finalPendiente' }).returning().get()
        .id
    numericSubjectId = subject('Teoría del Estado', 'TE-103', numericPeriod.id)
    binarySubjectId = subject('Coctelería', 'CO-1', binaryPeriod.id)
    orphanSubjectId = subject('Suelta', 'X-1', null)
  })

  function mesa(subjectId: number) {
    return repository.create({ subjectId, label: '1ra mesa', takenOn: '2026-08-05', result: 'pendiente' })
  }

  // Mesas are born pendiente; the nota only ever arrives with the approval.
  it('creates every instance without a grade', () => {
    expect(mesa(numericSubjectId).grade).toBeNull()
  })

  it('persists the nota of an approved instance under a numeric program', () => {
    const created = mesa(numericSubjectId)

    const updated = repository.update({
      id: created.id,
      label: created.label,
      takenOn: created.takenOn,
      result: 'aprobado',
      grade: 8
    })

    expect(updated).toMatchObject({ result: 'aprobado', grade: 8 })
    expect(db.select().from(finalExams).all()[0]!.grade).toBe(8)
  })

  it('approves without a nota — "Aprobada sin nota" is a legitimate state', () => {
    const created = mesa(numericSubjectId)

    const updated = repository.update({
      id: created.id,
      label: created.label,
      takenOn: created.takenOn,
      result: 'aprobado',
      grade: null
    })

    expect(updated).toMatchObject({ result: 'aprobado', grade: null })
  })

  it.each(['pendiente', 'reprobado'] as const)('rejects a nota on a %s result', (result) => {
    const created = mesa(numericSubjectId)

    expect(() =>
      repository.update({ id: created.id, label: created.label, takenOn: created.takenOn, result, grade: 8 })
    ).toThrow(/approved/)
  })

  it('rejects a nota over the program scale', () => {
    const created = mesa(numericSubjectId)

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
    const created = mesa(binarySubjectId)

    expect(() =>
      repository.update({
        id: created.id,
        label: created.label,
        takenOn: created.takenOn,
        result: 'aprobado',
        grade: 8
      })
    ).toThrow(/pass\/fail/)
  })

  it('rejects a nota for a subject outside any program — no scale to check against', () => {
    const created = mesa(orphanSubjectId)

    expect(() =>
      repository.update({
        id: created.id,
        label: created.label,
        takenOn: created.takenOn,
        result: 'aprobado',
        grade: 8
      })
    ).toThrow(/program/)
  })

  // The nota belongs to the approved result — moving away from it must not
  // leave a stale number behind that a later re-approval would resurrect.
  it('clears the stored nota when the result moves away from aprobado', () => {
    const created = mesa(numericSubjectId)
    repository.update({ id: created.id, label: created.label, takenOn: created.takenOn, result: 'aprobado', grade: 8 })

    const updated = repository.update({
      id: created.id,
      label: created.label,
      takenOn: created.takenOn,
      result: 'reprobado',
      grade: null
    })

    expect(updated).toMatchObject({ result: 'reprobado', grade: null })
    expect(db.select().from(finalExams).all()[0]!.grade).toBeNull()
  })
})
