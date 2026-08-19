import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { subjects } from '../../db/schema'
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

    const updated = repository.update({ id: created.id, label: '1ra', takenOn: '2026-08-05', result: 'reprobado' })

    expect(updated).toMatchObject({ result: 'reprobado', takenOn: '2026-08-05' })
  })

  // Recording a result must never touch the subject: its state is DERIVED.
  it('never writes the subject outcome itself', () => {
    const created = repository.create({ subjectId, label: '1ra', takenOn: null, result: 'pendiente' })

    repository.update({ id: created.id, label: '1ra', takenOn: null, result: 'reprobado' })

    expect(db.select().from(subjects).all()[0].outcome).toBe('finalPendiente')
  })

  it('returns null when updating an unknown instance', () => {
    expect(repository.update({ id: 999, label: 'x', takenOn: null, result: 'pendiente' })).toBeNull()
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
