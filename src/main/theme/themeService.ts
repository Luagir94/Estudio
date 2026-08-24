import { DEFAULT_THEME_PREFERENCE, themePreferenceSchema, type ThemePreference } from '../../shared/ipc/theme'

/**
 * Where the preference lives: one row in the generic `app_settings` key/value
 * store (`sqliteAppSettingsRepository`), the same table the CLI opt-ins use —
 * a single enum-valued string needs no table of its own.
 */
export const THEME_PREFERENCE_KEY = 'app.themePreference'

/** The `get`/`set` slice of `AppSettingsRepository` this service needs. */
export interface ThemeSettingsPort {
  get(key: string): string | null
  set(key: string, value: string | null): void
}

export interface ThemeService {
  /** The persisted preference, or the default when nothing (valid) was ever chosen. */
  getPreference(): ThemePreference
  /** Persists AND applies in one act, returning what was persisted. */
  setPreference(preference: ThemePreference): ThemePreference
  /** Startup half: re-applies last session's choice before the window opens. A pure read. */
  applyStoredPreference(): void
}

interface CreateThemeServiceDeps {
  settings: ThemeSettingsPort
  /**
   * Assigns Electron's `nativeTheme.themeSource` — injected as a function so
   * this module never imports Electron, same convention as
   * `notifyStatusChanged` in `main/index.ts`. The preference IS the source
   * value: the shared contract pins the enum to Electron's own union.
   */
  applyThemeSource: (source: ThemePreference) => void
}

export function createThemeService({ settings, applyThemeSource }: CreateThemeServiceDeps): ThemeService {
  function getPreference(): ThemePreference {
    // The settings table is plain strings; a row this contract does not
    // recognize (a hand-edited file, a future build's value) degrades to the
    // default rather than throwing or reaching Electron raw — same
    // safeParse-with-fallback discipline as `cli:preferences`' lastStatus.
    return themePreferenceSchema.safeParse(settings.get(THEME_PREFERENCE_KEY)).data ?? DEFAULT_THEME_PREFERENCE
  }

  return {
    getPreference,
    setPreference(preference) {
      // Persist FIRST: the returned (and cached) value must never claim a
      // choice that failed to outlive the process.
      settings.set(THEME_PREFERENCE_KEY, preference)
      applyThemeSource(preference)
      return preference
    },
    applyStoredPreference() {
      applyThemeSource(getPreference())
    }
  }
}
