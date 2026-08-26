import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { attachments, attendanceRecords, subjects } from '../../db/schema'
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

  // An apunte is a markdown ATTACHMENT now, so this repository no longer
  // WRITES one — `attachmentService.saveClassNote` does, because writing an
  // apunte means a file, a preview and an FTS re-index. What is left here is
  // the READ, and what it reads is the `attachments` rows carrying a
  // `class_date`. These tests therefore insert attachment rows directly:
  // that is exactly the shape the production write path leaves behind.
  describe('class notes (projected out of attachments)', () => {
    function insertApunte(owner: number, classDate: string, preview: string | null) {
      return db
        .insert(attachments)
        .values({
          subjectId: owner,
          fileName: `apunte-${classDate}.md`,
          storedPath: `${owner}/apunte-${classDate}.md`,
          mimeType: null,
          sizeBytes: 10,
          title: preview,
          createdAt: '2026-08-14T10:00',
          origin: 'class-note',
          classDate
        })
        .returning()
        .get()
    }

    it('projects an apunte attachment as the class it belongs to', () => {
      const row = insertApunte(subjectId, '2026-08-14', 'Round robin y starvation.')

      expect(repository.listNotesBySubject(subjectId)).toEqual([
        { id: row.id, subjectId, date: '2026-08-14', preview: 'Round robin y starvation.' }
      ])
    })

    /*
     * The id is the ATTACHMENT's, and that is the point: it is what the
     * renderer hands to `adjuntos:read`/`adjuntos:write` to open the editor.
     * A synthetic id here would be an id that opens nothing.
     */
    it('carries the attachment id, because that is what opens the editor', () => {
      const row = insertApunte(subjectId, '2026-08-14', 'Algo')

      expect(repository.listNotesBySubject(subjectId)[0]!.id).toBe(row.id)
    })

    /*
     * An ordinary attachment is course material, not an apunte. Only the
     * `class_date` tells them apart, so a list that ignored it would show
     * every PDF the student ever uploaded as a class note.
     */
    it('ignores attachments that are not apuntes', () => {
      db.insert(attachments)
        .values({
          subjectId,
          fileName: 'teorica.pdf',
          storedPath: `${subjectId}/teorica.pdf`,
          mimeType: null,
          sizeBytes: 2048,
          title: null,
          createdAt: '2026-08-14T10:00',
          origin: 'user',
          classDate: null
        })
        .run()

      expect(repository.listNotesBySubject(subjectId)).toEqual([])
    })

    it('orders apuntes newest class first', () => {
      insertApunte(subjectId, '2026-08-12', 'Vieja')
      insertApunte(subjectId, '2026-08-20', 'Nueva')

      expect(repository.listNotesBySubject(subjectId).map((note) => note.date)).toEqual(['2026-08-20', '2026-08-12'])
    })

    /*
     * `title` is nullable at the column level, so an apunte written before it
     * carried a preview must degrade to an empty label — never crash the list.
     * The apunte itself is the FILE; this is only how it gets announced.
     */
    it('degrades a missing preview to an empty one rather than failing the list', () => {
      insertApunte(subjectId, '2026-08-14', null)

      expect(repository.listNotesBySubject(subjectId)[0]!.preview).toBe('')
    })

    it('lists every apunte across subjects for the dashboard read', () => {
      const other = db.insert(subjects).values({ name: 'Otra', code: 'O-1', color: '#fff' }).returning().get()
      insertApunte(subjectId, '2026-08-14', 'Uno')
      insertApunte(other.id, '2026-08-14', 'Dos')

      expect(repository.listNotes()).toHaveLength(2)
    })
  })

  // Marks and apuntes both hang off the subject with `ON DELETE CASCADE` —
  // apuntes now through `attachments`, which carried that rule already. Like
  // the others, the rows are removed by SQLite itself, which is what makes
  // this a real check on `PRAGMA foreign_keys = ON` rather than on app code.
  describe('cascade delete', () => {
    it('removes a subject-s marks and apuntes when the subject is deleted', () => {
      repository.setAttendance({ subjectId, date: '2026-08-14', status: 'presente' })
      db.insert(attachments)
        .values({
          subjectId,
          fileName: 'apunte-2026-08-14.md',
          storedPath: `${subjectId}/apunte-2026-08-14.md`,
          mimeType: null,
          sizeBytes: 10,
          title: 'Round robin.',
          createdAt: '2026-08-14T10:00',
          origin: 'class-note',
          classDate: '2026-08-14'
        })
        .run()

      db.delete(subjects).where(eq(subjects.id, subjectId)).run()

      expect(db.select().from(attendanceRecords).all()).toEqual([])
      expect(db.select().from(attachments).all()).toEqual([])
    })
  })
})
