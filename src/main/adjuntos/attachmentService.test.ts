import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openAppDatabase } from '../db/connection'
import { subjects } from '../db/schema'
import { createSqliteAttachmentRepository, type AttachmentRepository } from './adapters/sqliteAttachmentRepository'
import type { AttachmentStorage } from './adapters/fileAttachmentStorage'
import { MAX_ATTACHMENT_BYTES } from './domain/limits'
import { createAttachmentService, type AttachmentIndexerPort, type AttachmentService } from './attachmentService'

const migrationsFolder = path.join(__dirname, '../../../drizzle/migrations')

// Real `:memory:` repository (production migrator, same pattern as
// `sqliteAttachmentRepository.test.ts`) + a MOCKED storage port — the
// service's own orchestration (order of operations, per-file isolation,
// pre-copy size cap) is what's under test here, not either port's internals.
function createTestDb() {
  const { db } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

function seedSubject(db: ReturnType<typeof createTestDb>): number {
  return db.insert(subjects).values({ name: 'Algoritmos', code: 'ALG-101', color: '#7c3aed' }).returning().get().id
}

function createStorageMock(overrides: Partial<AttachmentStorage> = {}): AttachmentStorage {
  return {
    statSize: vi.fn().mockResolvedValue(10),
    copyIntoSubjectDir: vi.fn().mockResolvedValue('stored/path.pdf'),
    resolveStoredPath: vi.fn(),
    removeFile: vi.fn().mockResolvedValue(undefined),
    removeSubjectDir: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

function createIndexerMock(): AttachmentIndexerPort {
  return { enqueue: vi.fn() }
}

describe('createAttachmentService', () => {
  let repository: AttachmentRepository
  let subjectId: number
  let indexer: AttachmentIndexerPort

  beforeEach(() => {
    const db = createTestDb()
    repository = createSqliteAttachmentRepository(db)
    subjectId = seedSubject(db)
    indexer = createIndexerMock()
  })

  it('checks size, copies, then inserts the row, in that order', async () => {
    const calls: string[] = []
    const storage = createStorageMock({
      statSize: vi.fn().mockImplementation(async () => {
        calls.push('statSize')
        return 10
      }),
      copyIntoSubjectDir: vi.fn().mockImplementation(async () => {
        calls.push('copyIntoSubjectDir')
        return path.join(String(subjectId), 'uuid-apuntes.pdf')
      })
    })
    const service: AttachmentService = createAttachmentService({ repository, storage, indexer })

    const result = await service.addAttachments(subjectId, [path.join('C:', 'Users', 'lucho', 'apuntes.pdf')])

    expect(calls).toEqual(['statSize', 'copyIntoSubjectDir'])
    expect(result.failures).toEqual([])
    expect(result.added).toHaveLength(1)
    expect(result.added[0]).toMatchObject({
      subjectId,
      fileName: 'apuntes.pdf',
      sizeBytes: 10,
      mimeType: null,
      title: null
    })
  })

  it('rejects a file over the size cap BEFORE copying — no partial or full copy is left on disk', async () => {
    const storage = createStorageMock({ statSize: vi.fn().mockResolvedValue(MAX_ATTACHMENT_BYTES + 1) })
    const service = createAttachmentService({ repository, storage, indexer })

    const result = await service.addAttachments(subjectId, [path.join('C:', 'huge.iso')])

    expect(storage.copyIntoSubjectDir).not.toHaveBeenCalled()
    expect(result.added).toEqual([])
    expect(result.failures).toEqual([
      { fileName: 'huge.iso', code: 'FILE_TOO_LARGE', message: expect.stringContaining('huge.iso') }
    ])
  })

  it('best-effort unlinks the copy when the DB insert fails, and reports it as a failure', async () => {
    const nonExistentSubjectId = subjectId + 999
    const storage = createStorageMock({
      copyIntoSubjectDir: vi.fn().mockResolvedValue(path.join(String(nonExistentSubjectId), 'uuid-apuntes.pdf'))
    })
    const service = createAttachmentService({ repository, storage, indexer })

    // A subjectId with no matching row violates the `attachments.subject_id`
    // FK — a REAL insert failure, not a mocked one (repository.insert
    // throws because `PRAGMA foreign_keys = ON`, connection.ts:15).
    const result = await service.addAttachments(nonExistentSubjectId, [path.join('C:', 'apuntes.pdf')])

    expect(storage.removeFile).toHaveBeenCalledWith(path.join(String(nonExistentSubjectId), 'uuid-apuntes.pdf'))
    expect(result.added).toEqual([])
    expect(result.failures).toEqual([{ fileName: 'apuntes.pdf', code: 'COPY_FAILED', message: expect.any(String) }])
  })

  it('adds two files with the same filename in one batch without one overwriting the other on disk', async () => {
    // The UUID prefix (`${randomUUID()}-${sanitizeFileName(fileName)}`,
    // attachmentService.ts:59) is what makes same-name collisions impossible
    // by construction — nothing exercised that directly until now. This mock
    // mirrors the REAL `storedFileName` the service computed back into the
    // storedPath, so a regression that dropped the UUID prefix would make
    // both calls receive the identical `storedFileName` and both rows land
    // on the identical `storedPath` — which the assertions below would catch.
    const storedFileNames: string[] = []
    const storage = createStorageMock({
      copyIntoSubjectDir: vi
        .fn()
        .mockImplementation(async (targetSubjectId: number, _sourcePath: string, storedFileName: string) => {
          storedFileNames.push(storedFileName)
          return path.join(String(targetSubjectId), storedFileName)
        })
    })
    const service = createAttachmentService({ repository, storage, indexer })

    const result = await service.addAttachments(subjectId, [
      path.join('C:', 'carpeta-a', 'apuntes.pdf'),
      path.join('C:', 'carpeta-b', 'apuntes.pdf')
    ])

    expect(result.failures).toEqual([])
    expect(result.added).toHaveLength(2)
    expect(result.added[0]?.fileName).toBe('apuntes.pdf')
    expect(result.added[1]?.fileName).toBe('apuntes.pdf')
    expect(result.added[0]?.storedPath).not.toBe(result.added[1]?.storedPath)
    expect(storage.copyIntoSubjectDir).toHaveBeenCalledTimes(2)
    expect(storedFileNames[0]).not.toBe(storedFileNames[1])
  })

  it("one file's failure never aborts the others — isolation across a mixed batch", async () => {
    const storage = createStorageMock({
      statSize: vi.fn().mockImplementation(async (sourcePath: string) => {
        if (sourcePath.includes('bad')) {
          throw new Error('ENOENT: no such file')
        }
        return 10
      }),
      copyIntoSubjectDir: vi.fn().mockResolvedValue(path.join(String(subjectId), 'uuid-good.pdf'))
    })
    const service = createAttachmentService({ repository, storage, indexer })

    const result = await service.addAttachments(subjectId, [path.join('C:', 'bad.pdf'), path.join('C:', 'good.pdf')])

    expect(result.added).toHaveLength(1)
    expect(result.added[0]).toMatchObject({ fileName: 'good.pdf' })
    expect(result.failures).toEqual([
      { fileName: 'bad.pdf', code: 'COPY_FAILED', message: expect.stringContaining('ENOENT') }
    ])
  })

  it('fires the indexer AFTER a successful insert, with that exact row\'s attachmentId (design "Port Contracts")', async () => {
    const storage = createStorageMock({
      copyIntoSubjectDir: vi.fn().mockResolvedValue(path.join(String(subjectId), 'uuid-apuntes.pdf'))
    })
    const service = createAttachmentService({ repository, storage, indexer })

    const result = await service.addAttachments(subjectId, [path.join('C:', 'apuntes.pdf')])

    expect(indexer.enqueue).toHaveBeenCalledTimes(1)
    expect(indexer.enqueue).toHaveBeenCalledWith({
      attachmentId: result.added[0]?.id,
      subjectId,
      storedPath: path.join(String(subjectId), 'uuid-apuntes.pdf'),
      fileName: 'apuntes.pdf'
    })
  })

  it('never fires the indexer when the insert fails — the port only ever sees rows that really exist (spec: Non-blocking upload)', async () => {
    const nonExistentSubjectId = subjectId + 999
    const storage = createStorageMock({
      copyIntoSubjectDir: vi.fn().mockResolvedValue(path.join(String(nonExistentSubjectId), 'uuid-apuntes.pdf'))
    })
    const service = createAttachmentService({ repository, storage, indexer })

    await service.addAttachments(nonExistentSubjectId, [path.join('C:', 'apuntes.pdf')])

    expect(indexer.enqueue).not.toHaveBeenCalled()
  })
})
