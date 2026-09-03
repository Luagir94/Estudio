import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { MCP_SLICES, isAllowed } from '../domain/permissions'
import { createSqliteMcpPermissionRepository } from './sqliteMcpPermissionRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

// Same production connection factory + real migrator as
// sqliteAcademicDateRepository.test.ts, so the schema under test is the one
// `npm run db:generate` actually produced.
function createTestDb() {
  const { db } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

describe('createSqliteMcpPermissionRepository', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('denies every slice when the table has no rows (default-deny)', () => {
    const repository = createSqliteMcpPermissionRepository(db)

    const matrix = repository.getMatrix()

    expect(matrix).toEqual({})
    for (const slice of MCP_SLICES) {
      expect(isAllowed(matrix, slice, 'read')).toBe(false)
      expect(isAllowed(matrix, slice, 'write')).toBe(false)
    }
    expect(repository.hasAnyGrant()).toBe(false)
  })

  it('grants only the slice that was written, leaving every other slice denied', () => {
    const repository = createSqliteMcpPermissionRepository(db)

    const grant = repository.setPermission({
      slice: 'materias',
      canRead: true,
      canWrite: false,
      updatedAt: '2026-09-02T18:00'
    })

    expect(grant).toEqual({ canRead: true, canWrite: false })

    const matrix = repository.getMatrix()
    expect(matrix).toEqual({ materias: { canRead: true, canWrite: false } })
    expect(isAllowed(matrix, 'materias', 'read')).toBe(true)
    expect(isAllowed(matrix, 'materias', 'write')).toBe(false)
    // A slice that never received a row stays denied, per the same matrix.
    expect(isAllowed(matrix, 'carreras', 'read')).toBe(false)
    expect(repository.hasAnyGrant()).toBe(true)
  })

  it('upserts the same slice instead of accumulating rows', () => {
    const repository = createSqliteMcpPermissionRepository(db)

    repository.setPermission({ slice: 'entregas', canRead: true, canWrite: true, updatedAt: '2026-09-02T18:00' })
    const updated = repository.setPermission({
      slice: 'entregas',
      canRead: true,
      canWrite: false,
      updatedAt: '2026-09-02T19:00'
    })

    expect(updated).toEqual({ canRead: true, canWrite: false })
    const matrix = repository.getMatrix()
    // One key, not two — the second call updated the existing row rather
    // than inserting a second one under the same primary key.
    expect(Object.keys(matrix)).toEqual(['entregas'])
    expect(matrix.entregas).toEqual({ canRead: true, canWrite: false })
  })

  it('withdrawing every grant on a slice removes it from access again', () => {
    const repository = createSqliteMcpPermissionRepository(db)

    repository.setPermission({ slice: 'fechas', canRead: true, canWrite: true, updatedAt: '2026-09-02T18:00' })
    repository.setPermission({ slice: 'fechas', canRead: false, canWrite: false, updatedAt: '2026-09-02T19:00' })

    const matrix = repository.getMatrix()
    expect(isAllowed(matrix, 'fechas', 'read')).toBe(false)
    expect(isAllowed(matrix, 'fechas', 'write')).toBe(false)
    expect(repository.hasAnyGrant()).toBe(false)
  })
})
