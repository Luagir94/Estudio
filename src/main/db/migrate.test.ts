import { describe, expect, it, vi } from 'vitest'
import { backupAndMigrate } from './migrate'

describe('backupAndMigrate (pre-migration backup)', () => {
  it('writes a versioned backup before the migrator runs when migrations are pending', () => {
    const dbHandle = { closed: false }
    const callOrder: string[] = []
    const copyFile = vi.fn(() => callOrder.push('backup'))
    const runMigrator = vi.fn(() => callOrder.push('migrate'))

    const result = backupAndMigrate({
      dbPath: 'C:/userData/course-companion.db',
      migrationsFolder: 'drizzle/migrations',
      fileExists: () => true,
      readJournal: () => [
        { idx: 0, tag: '0000_init' },
        { idx: 1, tag: '0001_subjects' }
      ],
      openDatabase: () => dbHandle as never,
      countAppliedMigrations: () => 1,
      copyFile,
      runMigrator,
      closeDatabase: vi.fn()
    })

    expect(result.backupCreated).toBe(true)
    expect(result.backupPath).toBe('C:/userData/course-companion.db.bak-2')
    expect(copyFile).toHaveBeenCalledWith('C:/userData/course-companion.db', 'C:/userData/course-companion.db.bak-2')
    // Backup must happen strictly before the migrator runs.
    expect(callOrder).toEqual(['backup', 'migrate'])
  })

  it('creates no backup file when the database is already at the current schema version', () => {
    const dbHandle = { closed: false }
    const copyFile = vi.fn()
    const runMigrator = vi.fn()

    const result = backupAndMigrate({
      dbPath: 'C:/userData/course-companion.db',
      migrationsFolder: 'drizzle/migrations',
      fileExists: () => true,
      readJournal: () => [{ idx: 0, tag: '0000_init' }],
      openDatabase: () => dbHandle as never,
      countAppliedMigrations: () => 1,
      copyFile,
      runMigrator,
      closeDatabase: vi.fn()
    })

    expect(result.backupCreated).toBe(false)
    expect(result.backupPath).toBeUndefined()
    expect(copyFile).not.toHaveBeenCalled()
    expect(runMigrator).toHaveBeenCalledTimes(1)
  })

  it('never backs up a brand-new database (no file yet) and still runs the migrator', () => {
    const dbHandle = { closed: false }
    const copyFile = vi.fn()
    const runMigrator = vi.fn()

    const result = backupAndMigrate({
      dbPath: 'C:/userData/course-companion.db',
      migrationsFolder: 'drizzle/migrations',
      fileExists: () => false,
      readJournal: () => [{ idx: 0, tag: '0000_init' }],
      openDatabase: () => dbHandle as never,
      countAppliedMigrations: () => 0,
      copyFile,
      runMigrator,
      closeDatabase: vi.fn()
    })

    expect(result.backupCreated).toBe(false)
    expect(copyFile).not.toHaveBeenCalled()
    expect(runMigrator).toHaveBeenCalledTimes(1)
  })
})
