import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>

/**
 * Opens the app's single long-lived SQLite connection. `foreign_keys` MUST
 * be turned on explicitly — SQLite ignores `REFERENCES ... ON DELETE
 * CASCADE` otherwise (design §3's cascade-delete rules depend on this).
 */
export function openAppDatabase(dbPath: string): { db: AppDatabase; raw: Database.Database } {
  const raw = new Database(dbPath)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  const db = drizzle(raw, { schema })
  return { db, raw }
}
