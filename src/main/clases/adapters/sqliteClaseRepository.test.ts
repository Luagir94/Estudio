import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { attendanceRecords, classNotes, subjects } from '../../db/schema'
import { createSqliteClaseRepository } from './sqliteClaseRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

function createTestDb() {
  const { db } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

describe('createSqliteClaseRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repository: ReturnType<typeof createSqliteClaseRepository>
  let subjectId: number

  beforeEach(() => {
    db = createTestDb()
    repository = createSqliteClaseRepository(db)
    subjectId = db
      .insert(subjects)
      .values({ name: 'Sistemas Operativos', code: 'SO-301', color: '#fff' })
      .returning()
      .get().id
  })

  describe('attendance', () => {
    it('records a mark for one class', () => {
      const mark = repository.setAttendance({ subjectId, date: '2026-08-14', status: 'presente' })

      expect(mark).toMatchObject({ subjectId, date: '2026-08-14', status: 'presente' })
    })

    // The whole point of the UNIQUE index on `(subject_id, date)`: one mark
    // per class. A second write is a correction, not a second mark.
    it('updates the existing mark instead of duplicating it', () => {
      const first = repository.setAttendance({ subjectId, date: '2026-08-14', status: 'presente' })
      const second = repository.setAttendance({ subjectId, date: '2026-08-14', status: 'ausente' })

      expect(second.id).toBe(first.id)
      expect(second.status).toBe('ausente')
      expect(repository.listAttendanceBySubject(subjectId)).toHaveLength(1)
    })

    // Same subject, different days are different classes; same day, different
    // subjects are different classes too. The anchor is the PAIR.
    it('keeps one mark per subject and day', () => {
      const other = db.insert(subjects).values({ name: 'Otra', code: 'O-1', color: '#fff' }).returning().get()
      repository.setAttendance({ subjectId, date: '2026-08-14', status: 'presente' })
      repository.setAttendance({ subjectId, date: '2026-08-21', status: 'ausente' })
      repository.setAttendance({ subjectId: other.id, date: '2026-08-14', status: 'feriado' })

      expect(repository.listAttendanceBySubject(subjectId)).toHaveLength(2)
      expect(repository.listAttendanceBySubject(other.id)).toHaveLength(1)
    })

    // Clearing back to unmarked has to be possible — the approved ClassRow
    // draws an unmarked state, and it is the absence of a row.
    it('clears a mark back to unmarked', () => {
      repository.setAttendance({ subjectId, date: '2026-08-14', status: 'presente' })

      expect(repository.clearAttendance({ subjectId, date: '2026-08-14' })).toBe(true)
      expect(repository.listAttendanceBySubject(subjectId)).toEqual([])
    })

    it('reports clearing a class that was never marked', () => {
      expect(repository.clearAttendance({ subjectId, date: '2026-08-14' })).toBe(false)
    })

    it('refuses a stored status outside the closed set', () => {
      db.insert(attendanceRecords).values({ subjectId, date: '2026-08-14', status: 'tarde' }).run()

      expect(() => repository.listAttendanceBySubject(subjectId)).toThrow(/tarde/)
    })

    it('lists every subject`s marks for the dashboard read', () => {
      const other = db.insert(subjects).values({ name: 'Otra', code: 'O-1', color: '#fff' }).returning().get()
      repository.setAttendance({ subjectId, date: '2026-08-14', status: 'presente' })
      repository.setAttendance({ subjectId: other.id, date: '2026-08-14', status: 'ausente' })

      expect(repository.listAttendance()).toHaveLength(2)
    })
  })

  describe('class notes', () => {
    it('saves an apunte for one class', () => {
      const note = repository.saveNote({ subjectId, date: '2026-08-14', body: 'Round robin y starvation.' })

      expect(note).toMatchObject({ subjectId, date: '2026-08-14', body: 'Round robin y starvation.' })
    })

    it('updates the existing apunte instead of duplicating it', () => {
      const first = repository.saveNote({ subjectId, date: '2026-08-14', body: 'Round robin.' })
      const second = repository.saveNote({ subjectId, date: '2026-08-14', body: 'Round robin y quantum.' })

      expect(second.id).toBe(first.id)
      expect(second.body).toBe('Round robin y quantum.')
      expect(repository.listNotesBySubject(subjectId)).toHaveLength(1)
    })

    it('deletes an apunte', () => {
      repository.saveNote({ subjectId, date: '2026-08-14', body: 'Round robin.' })

      expect(repository.deleteNote({ subjectId, date: '2026-08-14' })).toBe(true)
      expect(repository.listNotesBySubject(subjectId)).toEqual([])
    })

    it('reports deleting an apunte that was never written', () => {
      expect(repository.deleteNote({ subjectId, date: '2026-08-14' })).toBe(false)
    })

    it('lists every subject`s apuntes for the dashboard read', () => {
      const other = db.insert(subjects).values({ name: 'Otra', code: 'O-1', color: '#fff' }).returning().get()
      repository.saveNote({ subjectId, date: '2026-08-14', body: 'Uno' })
      repository.saveNote({ subjectId: other.id, date: '2026-08-14', body: 'Dos' })

      expect(repository.listNotes()).toHaveLength(2)
    })
  })

  // Both tables hang off the subject with `ON DELETE CASCADE`, exactly like
  // schedule_slots/deadlines/final_exams/partial_exams — and, like those, the
  // rows are removed by SQLite itself, which is what makes this test a real
  // check on `PRAGMA foreign_keys = ON` rather than on app code.
  describe('cascade delete', () => {
    it('removes a subject`s marks and apuntes when the subject is deleted', () => {
      repository.setAttendance({ subjectId, date: '2026-08-14', status: 'presente' })
      repository.saveNote({ subjectId, date: '2026-08-14', body: 'Round robin.' })

      db.delete(subjects).where(eq(subjects.id, subjectId)).run()

      expect(db.select().from(attendanceRecords).all()).toEqual([])
      expect(db.select().from(classNotes).all()).toEqual([])
    })
  })
})
