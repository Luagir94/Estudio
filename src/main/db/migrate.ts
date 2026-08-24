import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

export interface MigrationJournalEntry {
  idx: number
  tag: string
}

export interface MigrationResult {
  backupCreated: boolean
  backupPath?: string
}

export interface MigrationDeps {
  /** Absolute path to the app's SQLite database file. */
  dbPath: string
  /** Absolute path to the bundled drizzle-kit migrations folder. */
  migrationsFolder: string
  copyFile?: (source: string, destination: string) => void
  fileExists?: (target: string) => boolean
  readJournal?: (migrationsFolder: string) => MigrationJournalEntry[]
  openDatabase?: (dbPath: string) => Database.Database
  countAppliedMigrations?: (db: Database.Database) => number
  runMigrator?: (db: Database.Database, migrationsFolder: string) => void
  closeDatabase?: (db: Database.Database) => void
}

function defaultReadJournal(migrationsFolder: string): MigrationJournalEntry[] {
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json')
  if (!fs.existsSync(journalPath)) {
    return []
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8')) as {
    entries?: MigrationJournalEntry[]
  }
  return journal.entries ?? []
}

function defaultCountAppliedMigrations(db: Database.Database): number {
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
    .get()
  if (!tableExists) {
    return 0
  }
  const row = db.prepare('SELECT COUNT(*) as count FROM __drizzle_migrations').get() as {
    count: number
  }
  return row.count
}

function defaultRunMigrator(db: Database.Database, migrationsFolder: string): void {
  migrate(drizzle(db), { migrationsFolder })
}

/**
 * Backs up the existing DB file before applying pending forward-only
 * migrations, per design §3 ("Migration strategy") and the
 * data-integrity spec's Pre-Migration Backup requirement.
 *
 * - If the on-disk journal has more entries than the DB has recorded as
 *   applied, a migration is pending: the DB file is copied aside as
 *   `{dbPath}.bak-{journalLength}` BEFORE the migrator runs.
 * - If the DB is already current (or does not exist yet), no backup is
 *   written — only the (idempotent, safe-to-always-call) migrator runs.
 *
 * All I/O is dependency-injected so this function is unit-testable
 * without touching a real file or SQLite database.
 */
export function backupAndMigrate(deps: MigrationDeps): MigrationResult {
  const {
    dbPath,
    migrationsFolder,
    copyFile = fs.copyFileSync,
    fileExists = fs.existsSync,
    readJournal = defaultReadJournal,
    openDatabase = (targetPath: string) => new Database(targetPath),
    countAppliedMigrations = defaultCountAppliedMigrations,
    runMigrator = defaultRunMigrator,
    closeDatabase = (db: Database.Database) => db.close()
  } = deps

  const journalEntries = readJournal(migrationsFolder)
  const dbAlreadyExists = fileExists(dbPath)

  const db = openDatabase(dbPath)
  const appliedCount = dbAlreadyExists ? countAppliedMigrations(db) : 0
  const hasPendingMigrations = dbAlreadyExists && journalEntries.length > appliedCount

  let backupCreated = false
  let backupPath: string | undefined

  if (hasPendingMigrations) {
    backupPath = `${dbPath}.bak-${journalEntries.length}`
    copyFile(dbPath, backupPath)
    backupCreated = true
  }

  try {
    runMigrator(db, migrationsFolder)
  } finally {
    closeDatabase(db)
  }

  return { backupCreated, backupPath }
}
