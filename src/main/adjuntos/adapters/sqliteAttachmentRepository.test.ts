import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { subjects } from '../../db/schema'
import { createSqliteAttachmentRepository } from './sqliteAttachmentRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

/**
 * Every test goes through the PRODUCTION connection factory
 * (`openAppDatabase`) and the PRODUCTION migrator — not a hand-rolled raw
 * connection — so the `foreign_keys` pragma that makes `ON DELETE CASCADE`
 * work is actually exercised (same pattern as
 * `sqliteSubjectRepository.test.ts`, gate-findings/slice-2a Finding 1).
 */
function createTestDb() {
  const { db, raw } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return { db, raw }
}

function seedSubject(db: ReturnType<typeof createTestDb>['db'], name = 'Algoritmos'): number {
  return db.insert(subjects).values({ name, code: 'ALG-101', color: '#7c3aed' }).returning().get().id
}

describe('createSqliteAttachmentRepository', () => {
  let db: ReturnType<typeof createTestDb>['db']
  let raw: ReturnType<typeof createTestDb>['raw']
  let subjectId: number

  beforeEach(() => {
    ;({ db, raw } = createTestDb())
    subjectId = seedSubject(db)
  })

  it('inserts an attachment row and returns it with a generated id', () => {
    const repository = createSqliteAttachmentRepository(db)

    const inserted = repository.insert({
      subjectId,
      fileName: 'apuntes.pdf',
      storedPath: path.join(String(subjectId), 'uuid-apuntes.pdf'),
      mimeType: null,
      sizeBytes: 1024,
      title: null,
      createdAt: '2026-08-16T10:00'
    })

    expect(inserted).toMatchObject({
      subjectId,
      fileName: 'apuntes.pdf',
      sizeBytes: 1024,
      mimeType: null,
      title: null,
      createdAt: '2026-08-16T10:00'
    })
    expect(typeof inserted.id).toBe('number')
  })

  it('get returns the inserted row by id', () => {
    const repository = createSqliteAttachmentRepository(db)
    const inserted = repository.insert({
      subjectId,
      fileName: 'foto.png',
      storedPath: path.join(String(subjectId), 'uuid-foto.png'),
      mimeType: null,
      sizeBytes: 2048,
      title: null,
      createdAt: '2026-08-16T10:05'
    })

    expect(repository.get(inserted.id)).toMatchObject({ id: inserted.id, fileName: 'foto.png' })
  })

  it('get returns null for an attachment id that does not exist', () => {
    const repository = createSqliteAttachmentRepository(db)

    expect(repository.get(999)).toBeNull()
  })

  it('listBySubject returns only the rows belonging to that subject', () => {
    const repository = createSqliteAttachmentRepository(db)
    const otherSubjectId = seedSubject(db, 'Otra materia')
    repository.insert({
      subjectId,
      fileName: 'mio.pdf',
      storedPath: path.join(String(subjectId), 'uuid-mio.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T10:00'
    })
    repository.insert({
      subjectId: otherSubjectId,
      fileName: 'ajeno.pdf',
      storedPath: path.join(String(otherSubjectId), 'uuid-ajeno.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T10:01'
    })

    const listed = repository.listBySubject(subjectId)

    expect(listed).toHaveLength(1)
    expect(listed[0]?.fileName).toBe('mio.pdf')
  })

  it('listBySubject returns an empty array for a subject that exists but has no attachments', () => {
    const repository = createSqliteAttachmentRepository(db)

    expect(repository.listBySubject(subjectId)).toEqual([])
  })

  it('listBySubject orders rows by createdAt ascending', () => {
    const repository = createSqliteAttachmentRepository(db)
    repository.insert({
      subjectId,
      fileName: 'segundo.pdf',
      storedPath: path.join(String(subjectId), 'uuid-segundo.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T12:00'
    })
    repository.insert({
      subjectId,
      fileName: 'primero.pdf',
      storedPath: path.join(String(subjectId), 'uuid-primero.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T08:00'
    })
    repository.insert({
      subjectId,
      fileName: 'tercero.pdf',
      storedPath: path.join(String(subjectId), 'uuid-tercero.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T20:00'
    })

    const listed = repository.listBySubject(subjectId)

    expect(listed.map((attachment) => attachment.fileName)).toEqual(['primero.pdf', 'segundo.pdf', 'tercero.pdf'])
  })

  it('remove deletes the row and returns it', () => {
    const repository = createSqliteAttachmentRepository(db)
    const inserted = repository.insert({
      subjectId,
      fileName: 'borrar.pdf',
      storedPath: path.join(String(subjectId), 'uuid-borrar.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T10:00'
    })

    const removed = repository.remove(inserted.id)

    expect(removed).toMatchObject({ id: inserted.id, fileName: 'borrar.pdf' })
    expect(repository.get(inserted.id)).toBeNull()
  })

  it('remove returns undefined and deletes nothing for an id that does not exist', () => {
    const repository = createSqliteAttachmentRepository(db)

    expect(repository.remove(999)).toBeUndefined()
  })

  it('cascade-deletes attachment rows when the owning subject is deleted', () => {
    const repository = createSqliteAttachmentRepository(db)
    repository.insert({
      subjectId,
      fileName: 'uno.pdf',
      storedPath: path.join(String(subjectId), 'uuid-uno.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T10:00'
    })
    repository.insert({
      subjectId,
      fileName: 'dos.pdf',
      storedPath: path.join(String(subjectId), 'uuid-dos.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T10:01'
    })

    db.delete(subjects).where(eq(subjects.id, subjectId)).run()

    expect(repository.listBySubject(subjectId)).toHaveLength(0)
    // Prove the CASCADE actually ran on the production connection (not just
    // that the repository's own filter hides them), same rationale as
    // sqliteSubjectRepository.test.ts's cascade test.
    const remaining = raw.prepare('SELECT COUNT(*) as count FROM attachments').get() as { count: number }
    expect(remaining.count).toBe(0)
  })
})
