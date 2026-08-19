import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { createSqliteAppSettingsRepository } from './sqliteAppSettingsRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

// Same production-connection-and-migrator pattern as
// `sqliteAttachmentRepository.test.ts` — the `app_settings` table only
// exists once the real migrator has actually run migration 0004.
function createTestDb() {
  const { db, raw } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return { db, raw }
}

describe('createSqliteAppSettingsRepository', () => {
  let db: ReturnType<typeof createTestDb>['db']

  beforeEach(() => {
    ;({ db } = createTestDb())
  })

  it('get returns null for a key that was never set', () => {
    const repository = createSqliteAppSettingsRepository(db)

    expect(repository.get('claude.executableOverride')).toBeNull()
  })

  it('set then get round-trips the stored value', () => {
    const repository = createSqliteAppSettingsRepository(db)

    repository.set('claude.executableOverride', 'C:\\tools\\claude.cmd')

    expect(repository.get('claude.executableOverride')).toBe('C:\\tools\\claude.cmd')
  })

  it('set overwrites a previously stored value for the same key', () => {
    const repository = createSqliteAppSettingsRepository(db)

    repository.set('claude.executableOverride', 'C:\\tools\\claude.cmd')
    repository.set('claude.executableOverride', 'D:\\other\\claude.exe')

    expect(repository.get('claude.executableOverride')).toBe('D:\\other\\claude.exe')
  })

  it('delete removes the row so get resumes returning null', () => {
    const repository = createSqliteAppSettingsRepository(db)
    repository.set('claude.executableOverride', 'C:\\tools\\claude.cmd')

    repository.delete('claude.executableOverride')

    expect(repository.get('claude.executableOverride')).toBeNull()
  })

  it('delete on a key that was never set is a harmless no-op', () => {
    const repository = createSqliteAppSettingsRepository(db)

    expect(() => repository.delete('claude.executableOverride')).not.toThrow()
    expect(repository.get('claude.executableOverride')).toBeNull()
  })

  // Spec "Override Lifecycle" — "Clear override" / design D5: a `null`
  // override MUST delete the row, never persist an empty-string sentinel —
  // `value` is NOT NULL in the schema specifically so an empty string can
  // never be mistaken for "no override set".
  it('set with a null value deletes the row rather than storing an empty string', () => {
    const repository = createSqliteAppSettingsRepository(db)
    repository.set('claude.executableOverride', 'C:\\tools\\claude.cmd')

    repository.set('claude.executableOverride', null)

    expect(repository.get('claude.executableOverride')).toBeNull()
  })

  it('does not affect other keys when setting or deleting one key', () => {
    const repository = createSqliteAppSettingsRepository(db)
    repository.set('claude.executableOverride', 'C:\\tools\\claude.cmd')
    repository.set('other.setting', 'unrelated-value')

    repository.set('claude.executableOverride', null)

    expect(repository.get('other.setting')).toBe('unrelated-value')
  })
})
