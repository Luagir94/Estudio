import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { subjects } from '../../db/schema'
import { createSqliteDeadlineRepository } from './sqliteDeadlineRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

// Every test goes through the PRODUCTION connection factory
// (`openAppDatabase`) and the PRODUCTION migrator — same precedent as
// sqliteSubjectRepository.test.ts (gate-findings/slice-2a Finding 1): a test
// that creates its own connection never actually proves the production
// `foreign_keys` pragma is what makes `ON DELETE CASCADE` work.
function createTestDb() {
  const { db } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

describe('createSqliteDeadlineRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let subjectId: number

  beforeEach(() => {
    db = createTestDb()
    const insertedSubject = db
      .insert(subjects)
      .values({ name: 'Sistemas Operativos', code: 'SO-101', color: '#4c8dff' })
      .returning()
      .get()
    subjectId = insertedSubject.id
  })

  it('create persists a deadline as pending (done: false) and enriches it with the subject name/color', () => {
    const repository = createSqliteDeadlineRepository(db)

    const created = repository.create({
      title: 'TP 2 — Scheduler',
      subjectId,
      type: 'Trabajo práctico',
      dueAt: '2027-08-18T23:59'
    })

    expect(created).toMatchObject({
      title: 'TP 2 — Scheduler',
      subjectId,
      type: 'Trabajo práctico',
      dueAt: '2027-08-18T23:59',
      done: false,
      subjectName: 'Sistemas Operativos',
      subjectColor: '#4c8dff'
    })
  })

  it('list returns every deadline enriched with its subject name/color', () => {
    const repository = createSqliteDeadlineRepository(db)
    repository.create({ title: 'TP 1', subjectId, type: 'Trabajo práctico', dueAt: '2027-08-10T23:59' })
    repository.create({ title: 'TP 2', subjectId, type: 'Trabajo práctico', dueAt: '2027-08-18T23:59' })

    const list = repository.list()

    expect(list).toHaveLength(2)
    expect(list.every((deadline) => deadline.subjectName === 'Sistemas Operativos')).toBe(true)
  })

  describe('update (spec: "Edit corrects a wrong fecha límite")', () => {
    it('corrects the fecha límite and persists it', () => {
      const repository = createSqliteDeadlineRepository(db)
      const created = repository.create({
        title: 'TP 2',
        subjectId,
        type: 'Trabajo práctico',
        dueAt: '2027-08-18T23:59'
      })

      const updated = repository.update({
        id: created.id,
        title: 'TP 2',
        subjectId,
        type: 'Trabajo práctico',
        dueAt: '2027-08-25T23:59'
      })

      expect(updated?.dueAt).toBe('2027-08-25T23:59')
    })

    it('returns null for a non-existent deadline id', () => {
      const repository = createSqliteDeadlineRepository(db)

      const updated = repository.update({ id: 9999, title: 'X', subjectId, type: 'Y', dueAt: '2027-08-25T23:59' })

      expect(updated).toBeNull()
    })
  })

  describe('setDone (spec: "Toggle done/pending" — binary only)', () => {
    it('toggles a pending deadline to done', () => {
      const repository = createSqliteDeadlineRepository(db)
      const created = repository.create({
        title: 'TP 2',
        subjectId,
        type: 'Trabajo práctico',
        dueAt: '2027-08-18T23:59'
      })

      const result = repository.setDone(created.id, true)

      expect(result?.done).toBe(true)
    })

    it('returns null for a non-existent deadline id', () => {
      const repository = createSqliteDeadlineRepository(db)

      expect(repository.setDone(9999, true)).toBeNull()
    })
  })

  describe('remove (spec: "Delete removes a cancelled deadline entirely, not as done")', () => {
    it('removes the deadline entirely — it is gone from list(), never left behind marked done', () => {
      const repository = createSqliteDeadlineRepository(db)
      const created = repository.create({
        title: 'Parcial cancelado',
        subjectId,
        type: 'Parcial',
        dueAt: '2027-08-18T23:59'
      })

      const removed = repository.remove(created.id)

      expect(removed).toBe(true)
      expect(repository.list()).toHaveLength(0)
    })

    it('returns false for a non-existent deadline id (spec: "Deleting a deadline cascades to nothing")', () => {
      const repository = createSqliteDeadlineRepository(db)

      expect(repository.remove(9999)).toBe(false)
    })
  })
})
