import { eq } from 'drizzle-orm'
import type { AppSettingsPort } from '../../cli/cliProbeService'
import type { AppDatabase } from '../../db/connection'
import { appSettings } from '../../db/schema'

export interface AppSettingsRepository extends AppSettingsPort {
  /**
   * Upserts `key` → `value`. `value === null` DELETES the row instead of
   * writing an empty string (design D5, spec "Override Lifecycle" — "Clear
   * override"): the schema's `value` column is NOT NULL specifically so
   * "no override" is always represented by the row's absence.
   */
  set(key: string, value: string | null): void
  /** Explicit delete, used when the caller already knows there is no value to write. */
  delete(key: string): void
}

/**
 * SQLite-backed generic key/value settings store (design D5), implementing
 * PR3's `AppSettingsPort` (`get`) plus `set`/`delete`. Thin by design — no
 * knowledge of the claude override key or any other caller-specific
 * concern lives here.
 */
export function createSqliteAppSettingsRepository(db: AppDatabase): AppSettingsRepository {
  function deleteKey(key: string): void {
    db.delete(appSettings).where(eq(appSettings.key, key)).run()
  }

  return {
    get(key) {
      return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value ?? null
    },
    set(key, value) {
      if (value === null) {
        deleteKey(key)
        return
      }
      db.insert(appSettings)
        .values({ key, value })
        .onConflictDoUpdate({ target: appSettings.key, set: { value } })
        .run()
    },
    delete: deleteKey
  }
}
