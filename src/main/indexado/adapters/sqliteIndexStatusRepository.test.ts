import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { attachments, subjects } from '../../db/schema'
import { createSqliteIndexStatusRepository, type IndexStatusRepository } from './sqliteIndexStatusRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

/**
 * Real `:memory:` + production `migrate()` — same pattern as
 * `sqliteChunkStore.test.ts`/`sqliteAttachmentRepository.test.ts` — so the
 * migration's `index_status` default and every drizzle column mapping are
 * actually exercised, not hand-rolled.
 */
function createTestDb() {
  const { db } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

function seedSubject(db: ReturnType<typeof createTestDb>, name = 'Algoritmos'): number {
  return db.insert(subjects).values({ name, code: 'ALG-101', color: '#7c3aed' }).returning().get().id
}

function seedAttachment(
  db: ReturnType<typeof createTestDb>,
  subjectId: number,
  overrides: { fileName?: string; indexStatus?: string } = {}
): number {
  return db
    .insert(attachments)
    .values({
      subjectId,
      fileName: overrides.fileName ?? 'apuntes.pdf',
      storedPath: `${subjectId}/uuid-${overrides.fileName ?? 'apuntes.pdf'}`,
      mimeType: null,
      sizeBytes: 1024,
      title: null,
      createdAt: '2026-08-21T10:00',
      ...(overrides.indexStatus !== undefined ? { indexStatus: overrides.indexStatus } : {})
    })
    .returning()
    .get().id
}

describe('createSqliteIndexStatusRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repository: IndexStatusRepository
  let subjectId: number

  beforeEach(() => {
    db = createTestDb()
    repository = createSqliteIndexStatusRepository(db)
    subjectId = seedSubject(db)
  })

  it('a newly inserted attachment defaults to pending (spec: New attachment starts pending)', () => {
    const attachmentId = seedAttachment(db, subjectId)

    const row = repository.get(attachmentId)

    expect(row).toEqual({
      id: attachmentId,
      subjectId,
      fileName: 'apuntes.pdf',
      storedPath: `${subjectId}/uuid-apuntes.pdf`,
      indexStatus: 'pending'
    })
  })

  it('get returns null when no attachment matches the id (design "load row (skip if deleted)")', () => {
    expect(repository.get(999999)).toBeNull()
  })

  it('listUnindexed returns pending AND not-indexable rows, excluding already-indexed ones (design "Sync scope")', () => {
    const pendingId = seedAttachment(db, subjectId, { fileName: 'pendiente.txt', indexStatus: 'pending' })
    const notIndexableId = seedAttachment(db, subjectId, { fileName: 'roto.png', indexStatus: 'not-indexable' })
    seedAttachment(db, subjectId, { fileName: 'listo.txt', indexStatus: 'indexed' })

    const rows = repository.listUnindexed()

    expect(rows.map((row) => row.id).sort()).toEqual([pendingId, notIndexableId].sort())
  })

  it('setStatus updates the row and get reflects the new status', () => {
    const attachmentId = seedAttachment(db, subjectId)

    repository.setStatus(attachmentId, 'indexed')

    expect(repository.get(attachmentId)?.indexStatus).toBe('indexed')
  })

  it('setStatus on a non-existent attachment id is a silent no-op (design "load row (skip if deleted)")', () => {
    expect(() => repository.setStatus(999999, 'indexed')).not.toThrow()
  })
})
