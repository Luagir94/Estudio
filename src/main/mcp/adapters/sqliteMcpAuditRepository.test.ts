import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { mcpAuditEntries } from '../../db/schema'
import type { AuditOutcome } from '../domain/auditEntry'
import { MAX_AUTH_FAILED_AUDIT_ROWS, MAX_NON_AUTH_AUDIT_ROWS } from '../domain/auditRetention'
import { createSqliteMcpAuditRepository } from './sqliteMcpAuditRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

// Same production connection factory + real migrator as
// sqliteMcpPermissionRepository.test.ts, so the schema under test is the one
// `npm run db:generate` actually produced.
function createTestDb() {
  const { db } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

type TestDb = ReturnType<typeof createTestDb>

/** Strictly increasing with `index`, so insertion order and `occurredAt` order agree. */
function occurredAtAt(index: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + index * 1000).toISOString()
}

/**
 * Seeds `count` rows directly into the table, bypassing the repository, so a
 * test can start from an already-oversized table without paying for
 * thousands of prune-checking transactions. Each row's `summary` embeds its
 * absolute index so a test can assert exactly which rows survived pruning.
 */
function seedRows(db: TestDb, count: number, outcome: AuditOutcome, startIndex: number): void {
  for (let i = 0; i < count; i += 1) {
    const index = startIndex + i
    db.insert(mcpAuditEntries)
      .values({
        occurredAt: occurredAtAt(index),
        tool: outcome === 'auth-failed' ? null : 'materias_list',
        slice: outcome === 'auth-failed' ? null : 'materias',
        action: outcome === 'auth-failed' ? null : 'read',
        outcome,
        summary: `seed-${outcome}-${index}`,
        clientName: null,
        errorCode: null
      })
      .run()
  }
}

function allRows(db: TestDb) {
  return db.select().from(mcpAuditEntries).all()
}

describe('createSqliteMcpAuditRepository', () => {
  let db: TestDb

  beforeEach(() => {
    db = createTestDb()
  })

  it('persists an inserted entry', () => {
    const repository = createSqliteMcpAuditRepository(db)

    repository.insert({
      occurredAt: occurredAtAt(0),
      tool: 'materias_create',
      slice: 'materias',
      action: 'write',
      outcome: 'success',
      summary: 'materias_create -> id=12',
      clientName: 'claude-desktop',
      errorCode: null
    })

    const rows = allRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tool: 'materias_create',
      outcome: 'success',
      summary: 'materias_create -> id=12',
      clientName: 'claude-desktop'
    })
  })

  it('prunes the oldest non-auth row in the same transaction once the 5,000 cap is exceeded', () => {
    seedRows(db, MAX_NON_AUTH_AUDIT_ROWS, 'success', 0)
    const repository = createSqliteMcpAuditRepository(db)

    repository.insert({
      occurredAt: occurredAtAt(MAX_NON_AUTH_AUDIT_ROWS),
      tool: 'materias_list',
      slice: 'materias',
      action: 'read',
      outcome: 'success',
      summary: `seed-success-${MAX_NON_AUTH_AUDIT_ROWS}`,
      clientName: null,
      errorCode: null
    })

    const rows = allRows(db)
    expect(rows).toHaveLength(MAX_NON_AUTH_AUDIT_ROWS)
    expect(rows.some((row) => row.summary === 'seed-success-0')).toBe(false)
    expect(rows.some((row) => row.summary === `seed-success-${MAX_NON_AUTH_AUDIT_ROWS}`)).toBe(true)
  })

  it('a flood of auth-failed inserts never prunes genuine non-auth history (design D10)', () => {
    seedRows(db, 3, 'denied', 0)
    seedRows(db, MAX_AUTH_FAILED_AUDIT_ROWS, 'auth-failed', 1000)
    const repository = createSqliteMcpAuditRepository(db)

    repository.insert({
      occurredAt: occurredAtAt(1000 + MAX_AUTH_FAILED_AUDIT_ROWS),
      tool: null,
      slice: null,
      action: null,
      outcome: 'auth-failed',
      summary: 'handshake rejected: token mismatch',
      clientName: null,
      errorCode: null
    })

    const rows = allRows(db)
    const authFailedRows = rows.filter((row) => row.outcome === 'auth-failed')
    const deniedRows = rows.filter((row) => row.outcome === 'denied')
    expect(authFailedRows).toHaveLength(MAX_AUTH_FAILED_AUDIT_ROWS)
    expect(deniedRows).toHaveLength(3)
    expect(authFailedRows.some((row) => row.summary === 'seed-auth-failed-1000')).toBe(false)
    expect(deniedRows.every((row) => row.summary.startsWith('seed-denied-'))).toBe(true)
  })

  it('a flood of non-auth inserts never prunes genuine auth-failed history (design D10, reverse direction)', () => {
    seedRows(db, 2, 'auth-failed', 0)
    seedRows(db, MAX_NON_AUTH_AUDIT_ROWS, 'success', 1000)
    const repository = createSqliteMcpAuditRepository(db)

    repository.insert({
      occurredAt: occurredAtAt(1000 + MAX_NON_AUTH_AUDIT_ROWS),
      tool: 'materias_list',
      slice: 'materias',
      action: 'read',
      outcome: 'success',
      summary: `seed-success-${1000 + MAX_NON_AUTH_AUDIT_ROWS}`,
      clientName: null,
      errorCode: null
    })

    const rows = allRows(db)
    const authFailedRows = rows.filter((row) => row.outcome === 'auth-failed')
    const nonAuthRows = rows.filter((row) => row.outcome !== 'auth-failed')
    expect(authFailedRows).toHaveLength(2)
    expect(authFailedRows.every((row) => row.summary.startsWith('seed-auth-failed-'))).toBe(true)
    expect(nonAuthRows).toHaveLength(MAX_NON_AUTH_AUDIT_ROWS)
    expect(nonAuthRows.some((row) => row.summary === 'seed-success-1000')).toBe(false)
  })

  // Task 14.3: `mcpService.dispatchAudit` needs the freshly-inserted row's id
  // to fan out `MCP_ACTIVITY_CHANGED_CHANNEL` (design D9, precedent
  // `notifyStatusChanged` in `indexadoService.ts`) — `insert` returning it is
  // what makes that possible without a second SELECT.
  it('returns the id of the row it just inserted', () => {
    const repository = createSqliteMcpAuditRepository(db)

    const first = repository.insert({
      occurredAt: occurredAtAt(0),
      tool: 'materias_list',
      slice: 'materias',
      action: 'read',
      outcome: 'success',
      summary: 'materias_list -> 3 rows',
      clientName: null,
      errorCode: null
    })
    const second = repository.insert({
      occurredAt: occurredAtAt(1),
      tool: 'materias_list',
      slice: 'materias',
      action: 'read',
      outcome: 'success',
      summary: 'materias_list -> 3 rows',
      clientName: null,
      errorCode: null
    })

    expect(second.id).toBeGreaterThan(first.id)
    const rows = allRows(db)
    expect(rows.find((row) => row.id === first.id)).toBeDefined()
    expect(rows.find((row) => row.id === second.id)).toBeDefined()
  })

  // Task 14.3: `mcp:listActivity` (design "`mcp:*` IPC contract" table).
  describe('list (task 14.3)', () => {
    it('returns rows newest-first (spec: "Activity trail is visible in-app, newest first")', () => {
      const repository = createSqliteMcpAuditRepository(db)
      repository.insert({
        occurredAt: occurredAtAt(0),
        tool: 'materias_list',
        slice: 'materias',
        action: 'read',
        outcome: 'success',
        summary: 'first',
        clientName: null,
        errorCode: null
      })
      repository.insert({
        occurredAt: occurredAtAt(1),
        tool: 'materias_list',
        slice: 'materias',
        action: 'read',
        outcome: 'success',
        summary: 'second',
        clientName: null,
        errorCode: null
      })

      const rows = repository.list()
      expect(rows.map((row) => row.summary)).toEqual(['second', 'first'])
    })

    it('caps the result at the given limit', () => {
      const repository = createSqliteMcpAuditRepository(db)
      seedRows(db, 5, 'success', 0)

      const rows = repository.list(2)
      expect(rows).toHaveLength(2)
      expect(rows.map((row) => row.summary)).toEqual(['seed-success-4', 'seed-success-3'])
    })

    it('defaults to every row when no limit is given', () => {
      const repository = createSqliteMcpAuditRepository(db)
      seedRows(db, 3, 'success', 0)

      expect(repository.list()).toHaveLength(3)
    })
  })
})
