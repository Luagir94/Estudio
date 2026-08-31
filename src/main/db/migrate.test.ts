import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { describe, expect, it, vi } from 'vitest'
import { openAppDatabase } from './connection'
import { backupAndMigrate, type MigrationJournalEntry } from './migrate'

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
        { idx: 0, tag: '0000_init', when: 10 },
        { idx: 1, tag: '0001_subjects', when: 20 }
      ],
      openDatabase: () => dbHandle as never,
      countAppliedMigrations: () => 1,
      copyFile,
      realignAppliedStamps: vi.fn(),
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
      readJournal: () => [{ idx: 0, tag: '0000_init', when: 10 }],
      openDatabase: () => dbHandle as never,
      countAppliedMigrations: () => 1,
      copyFile,
      realignAppliedStamps: vi.fn(),
      runMigrator,
      closeDatabase: vi.fn()
    })

    expect(result.backupCreated).toBe(false)
    expect(result.backupPath).toBeUndefined()
    expect(copyFile).not.toHaveBeenCalled()
    expect(runMigrator).toHaveBeenCalledTimes(1)
  })

  it('closes the database even when the migrator throws, and the error propagates', () => {
    const dbHandle = { closed: false }
    const migrationError = new Error('migration 0002 failed')
    const runMigrator = vi.fn(() => {
      throw migrationError
    })
    const closeDatabase = vi.fn()

    expect(() =>
      backupAndMigrate({
        dbPath: 'C:/userData/course-companion.db',
        migrationsFolder: 'drizzle/migrations',
        fileExists: () => true,
        readJournal: () => [
          { idx: 0, tag: '0000_init', when: 10 },
          { idx: 1, tag: '0001_subjects', when: 20 }
        ],
        openDatabase: () => dbHandle as never,
        countAppliedMigrations: () => 1,
        copyFile: vi.fn(),
        realignAppliedStamps: vi.fn(),
        runMigrator,
        closeDatabase
      })
    ).toThrow(migrationError)

    expect(closeDatabase).toHaveBeenCalledWith(dbHandle)
  })

  it('realigns the applied stamps after the backup and before the migrator runs', () => {
    const dbHandle = { closed: false }
    const callOrder: string[] = []

    backupAndMigrate({
      dbPath: 'C:/userData/course-companion.db',
      migrationsFolder: 'drizzle/migrations',
      fileExists: () => true,
      readJournal: () => [
        { idx: 0, tag: '0000_init', when: 10 },
        { idx: 1, tag: '0001_subjects', when: 20 }
      ],
      openDatabase: () => dbHandle as never,
      countAppliedMigrations: () => 1,
      copyFile: vi.fn(() => callOrder.push('backup')),
      realignAppliedStamps: vi.fn(() => callOrder.push('realign')),
      runMigrator: vi.fn(() => callOrder.push('migrate')),
      closeDatabase: vi.fn()
    })

    // The backup must capture the DB untouched, and the stamps must be honest
    // before the migrator decides what is still pending.
    expect(callOrder).toEqual(['backup', 'realign', 'migrate'])
  })

  it('never backs up a brand-new database (no file yet) and still runs the migrator', () => {
    const dbHandle = { closed: false }
    const copyFile = vi.fn()
    const runMigrator = vi.fn()

    const result = backupAndMigrate({
      dbPath: 'C:/userData/course-companion.db',
      migrationsFolder: 'drizzle/migrations',
      fileExists: () => false,
      readJournal: () => [{ idx: 0, tag: '0000_init', when: 10 }],
      openDatabase: () => dbHandle as never,
      countAppliedMigrations: () => 0,
      copyFile,
      realignAppliedStamps: vi.fn(),
      runMigrator,
      closeDatabase: vi.fn()
    })

    expect(result.backupCreated).toBe(false)
    expect(copyFile).not.toHaveBeenCalled()
    expect(runMigrator).toHaveBeenCalledTimes(1)
  })
})

// Drizzle decides what is still pending by comparing each journal entry's
// `when` against the LARGEST `created_at` in `__drizzle_migrations` — not
// against the set of applied hashes. Migration 0010 shipped with a `when`
// dated after every migration that followed it, so once it was applied every
// later migration looked applied too and was skipped forever, silently and
// with no error (that is how `attachments.class_date` went missing). This
// proves the repair against a real database corrupted exactly that way.
describe('backupAndMigrate — out-of-order applied stamps', () => {
  const fullMigrationsFolder = path.join(__dirname, '../../../drizzle/migrations')

  it('applies a migration that an out-of-order stamp had left permanently pending', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-stamps-'))
    const dbPath = path.join(tmpDir, 'course-companion.db')
    try {
      // A pre-0016 installation whose 0010 row was stamped past every
      // migration that came after it.
      const poisonedFolder = path.join(tmpDir, 'migrations')
      fs.cpSync(fullMigrationsFolder, poisonedFolder, { recursive: true })
      const journalPath = path.join(poisonedFolder, 'meta', '_journal.json')
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as { entries: MigrationJournalEntry[] }
      journal.entries = journal.entries
        .filter((entry) => entry.idx < 16)
        .map((entry) => (entry.idx === 10 ? { ...entry, when: 1787952000000 } : entry))
      fs.writeFileSync(journalPath, JSON.stringify(journal))

      const seeded = openAppDatabase(dbPath)
      migrate(seeded.db, { migrationsFolder: poisonedFolder })
      seeded.raw.close()

      backupAndMigrate({ dbPath, migrationsFolder: fullMigrationsFolder })

      const upgraded = openAppDatabase(dbPath)
      const columns = upgraded.raw.prepare('PRAGMA table_info(attachments)').all() as { name: string }[]
      upgraded.raw.close()
      expect(columns.map((column) => column.name)).toContain('class_date')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

// Data-migration behavior of 0010 (page-number citations), proven against a
// REAL pre-0010 database: migrations 0000..0009 are applied from a
// journal-truncated copy of the real folder, rows are seeded, and then the
// real folder applies ONLY the pending 0010 — the exact upgrade an existing
// installation goes through. The production migrator and connection factory
// run throughout, same discipline as the sqlite repository tests.
describe('migration 0010 — page columns and pdf re-index reset', () => {
  const fullMigrationsFolder = path.join(__dirname, '../../../drizzle/migrations')

  function createPre0010MigrationsFolder(tmpDir: string): string {
    const truncatedFolder = path.join(tmpDir, 'migrations')
    fs.cpSync(fullMigrationsFolder, truncatedFolder, { recursive: true })
    const journalPath = path.join(truncatedFolder, 'meta', '_journal.json')
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as { entries: MigrationJournalEntry[] }
    journal.entries = journal.entries.filter((entry) => entry.idx < 10)
    fs.writeFileSync(journalPath, JSON.stringify(journal))
    return truncatedFolder
  }

  it('resets index_status to pending for .pdf attachments only (case-insensitive), and adds the nullable page columns', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-0010-'))
    const { db, raw } = openAppDatabase(':memory:')
    try {
      migrate(db, { migrationsFolder: createPre0010MigrationsFolder(tmpDir) })

      raw.prepare("INSERT INTO subjects (name, code, color) VALUES ('Algoritmos', 'ALG-101', '#7c3aed')").run()
      const insertAttachment = raw.prepare(
        "INSERT INTO attachments (subject_id, file_name, stored_path, size_bytes, created_at, index_status) VALUES (1, ?, ?, 1024, '2026-08-20T10:00', ?)"
      )
      insertAttachment.run('apunte.pdf', '1/uuid-apunte.pdf', 'indexed')
      insertAttachment.run('APUNTE-VIEJO.PDF', '1/uuid-apunte-viejo.pdf', 'indexed')
      insertAttachment.run('escaneo.pdf', '1/uuid-escaneo.pdf', 'not-indexable')
      insertAttachment.run('notas.docx', '1/uuid-notas.docx', 'indexed')

      migrate(db, { migrationsFolder: fullMigrationsFolder })

      const rows = raw
        .prepare('SELECT file_name AS fileName, index_status AS indexStatus FROM attachments ORDER BY id ASC')
        .all() as { fileName: string; indexStatus: string }[]
      // Every PDF — whatever its case or prior status — goes back to
      // 'pending' so the existing `indexado:sync` path re-indexes it with
      // pages; non-PDF formats keep their status untouched.
      expect(rows).toEqual([
        { fileName: 'apunte.pdf', indexStatus: 'pending' },
        { fileName: 'APUNTE-VIEJO.PDF', indexStatus: 'pending' },
        { fileName: 'escaneo.pdf', indexStatus: 'pending' },
        { fileName: 'notas.docx', indexStatus: 'indexed' }
      ])

      const chunkColumns = raw.prepare('PRAGMA table_info(attachment_chunks)').all() as { name: string }[]
      const citationColumns = raw.prepare('PRAGMA table_info(ask_message_citations)').all() as { name: string }[]
      expect(chunkColumns.map((column) => column.name)).toContain('page')
      expect(citationColumns.map((column) => column.name)).toContain('page')
    } finally {
      raw.close()
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
