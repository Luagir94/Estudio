import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { attachments, subjects } from '../../db/schema'
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
      createdAt: '2026-08-16T10:00',
      origin: 'user'
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

  it('a newly inserted attachment defaults to indexStatus "pending" (attachment-fts-index spec: New attachment starts pending)', () => {
    const repository = createSqliteAttachmentRepository(db)

    const inserted = repository.insert({
      subjectId,
      fileName: 'apuntes.pdf',
      storedPath: path.join(String(subjectId), 'uuid-apuntes.pdf'),
      mimeType: null,
      sizeBytes: 1024,
      title: null,
      createdAt: '2026-08-16T10:00',
      origin: 'user'
    })

    expect(inserted.indexStatus).toBe('pending')
    expect(repository.get(inserted.id)?.indexStatus).toBe('pending')
  })

  // cli-generated-artifacts spec "Generated artifact is marked and badged":
  // `origin: 'ai-generated'` must round-trip through a real `:memory:` +
  // production `migrate()` exactly like any other column.
  it('inserts an attachment with origin "ai-generated" and round-trips it back unchanged', () => {
    const repository = createSqliteAttachmentRepository(db)

    const inserted = repository.insert({
      subjectId,
      fileName: 'resumen-parcial-1.md',
      storedPath: path.join(String(subjectId), 'uuid-resumen-parcial-1.md'),
      mimeType: null,
      sizeBytes: 512,
      title: null,
      createdAt: '2026-08-16T10:00',
      // `origin` is a REQUIRED field on `CreateAttachmentInput` (task 1.2) —
      // omitting it here would be a TypeScript compile error, not a runtime
      // one; every insert() call site in the codebase must pass it
      // explicitly, on purpose.
      origin: 'ai-generated'
    })

    expect(inserted.origin).toBe('ai-generated')
    expect(repository.get(inserted.id)?.origin).toBe('ai-generated')
  })

  // cli-generated-artifacts spec "Pre-existing rows migrate to 'user' by
  // default": a row written without an explicit `origin` (the pre-migration
  // 0008 shape, simulated here via a raw drizzle insert that bypasses
  // `CreateAttachmentInput`'s required field) must pick up the column's
  // `DEFAULT 'user'`.
  it('a legacy row written without an explicit origin column defaults to "user"', () => {
    const repository = createSqliteAttachmentRepository(db)
    const legacyId = db
      .insert(attachments)
      .values({
        subjectId,
        fileName: 'viejo.pdf',
        storedPath: path.join(String(subjectId), 'uuid-viejo.pdf'),
        mimeType: null,
        sizeBytes: 10,
        title: null,
        createdAt: '2026-08-01T09:00'
        // `origin` intentionally omitted.
      })
      .returning()
      .get().id

    expect(repository.get(legacyId)?.origin).toBe('user')
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
      createdAt: '2026-08-16T10:05',
      origin: 'user'
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
      createdAt: '2026-08-16T10:00',
      origin: 'user'
    })
    repository.insert({
      subjectId: otherSubjectId,
      fileName: 'ajeno.pdf',
      storedPath: path.join(String(otherSubjectId), 'uuid-ajeno.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T10:01',
      origin: 'user'
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
      createdAt: '2026-08-16T12:00',
      origin: 'user'
    })
    repository.insert({
      subjectId,
      fileName: 'primero.pdf',
      storedPath: path.join(String(subjectId), 'uuid-primero.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T08:00',
      origin: 'user'
    })
    repository.insert({
      subjectId,
      fileName: 'tercero.pdf',
      storedPath: path.join(String(subjectId), 'uuid-tercero.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T20:00',
      origin: 'user'
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
      createdAt: '2026-08-16T10:00',
      origin: 'user'
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
      createdAt: '2026-08-16T10:00',
      origin: 'user'
    })
    repository.insert({
      subjectId,
      fileName: 'dos.pdf',
      storedPath: path.join(String(subjectId), 'uuid-dos.pdf'),
      mimeType: null,
      sizeBytes: 10,
      title: null,
      createdAt: '2026-08-16T10:01',
      origin: 'user'
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

// markdown-attachment-viewer — the save path's row update: after the file is
// rewritten, the row's sizeBytes must reflect the new content and its
// indexStatus must drop back to 'pending' so the re-index is visible.
describe('createSqliteAttachmentRepository — update', () => {
  let db: ReturnType<typeof createTestDb>['db']
  let subjectId: number

  beforeEach(() => {
    ;({ db } = createTestDb())
    subjectId = seedSubject(db)
  })

  function insertMarkdownRow() {
    const repository = createSqliteAttachmentRepository(db)
    return repository.insert({
      subjectId,
      fileName: 'resumen.md',
      storedPath: path.join(String(subjectId), 'uuid-resumen.md'),
      mimeType: null,
      sizeBytes: 1024,
      title: null,
      createdAt: '2026-08-16T10:00',
      origin: 'user'
    })
  }

  it('persists the new sizeBytes and indexStatus and returns the updated record', () => {
    const repository = createSqliteAttachmentRepository(db)
    const inserted = insertMarkdownRow()
    // Simulate a completed indexing pass so the flip back to pending is real.
    db.update(attachments).set({ indexStatus: 'indexed' }).where(eq(attachments.id, inserted.id)).run()

    const updated = repository.update(inserted.id, { sizeBytes: 2048, indexStatus: 'pending' })

    expect(updated).toMatchObject({ id: inserted.id, sizeBytes: 2048, indexStatus: 'pending' })
    expect(repository.get(inserted.id)).toMatchObject({ sizeBytes: 2048, indexStatus: 'pending' })
  })

  it('leaves every other column untouched', () => {
    const repository = createSqliteAttachmentRepository(db)
    const inserted = insertMarkdownRow()

    const updated = repository.update(inserted.id, { sizeBytes: 999, indexStatus: 'pending' })

    expect(updated).toMatchObject({
      subjectId,
      fileName: 'resumen.md',
      storedPath: path.join(String(subjectId), 'uuid-resumen.md'),
      mimeType: null,
      title: null,
      createdAt: '2026-08-16T10:00',
      origin: 'user'
    })
  })

  it('returns undefined when no row with that id exists', () => {
    const repository = createSqliteAttachmentRepository(db)

    expect(repository.update(999, { sizeBytes: 1, indexStatus: 'pending' })).toBeUndefined()
  })
})
