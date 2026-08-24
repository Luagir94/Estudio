import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemePreference } from '../../shared/ipc/theme'
import { createThemeService, THEME_PREFERENCE_KEY } from './themeService'

/**
 * In-memory stand-in for the generic app-settings store — the service only
 * needs `get`/`set`, and this keeps the test free of a real database the way
 * `registerCliHandlers.test.ts` keeps its settings port fake.
 */
function createFakeSettings() {
  const rows = new Map<string, string>()
  return {
    rows,
    get: vi.fn((key: string) => rows.get(key) ?? null),
    set: vi.fn((key: string, value: string | null) => {
      if (value === null) {
        rows.delete(key)
        return
      }
      rows.set(key, value)
    })
  }
}

describe('createThemeService', () => {
  let settings: ReturnType<typeof createFakeSettings>
  let applyThemeSource: ReturnType<typeof vi.fn<(source: ThemePreference) => void>>

  beforeEach(() => {
    settings = createFakeSettings()
    applyThemeSource = vi.fn<(source: ThemePreference) => void>()
  })

  const service = () => createThemeService({ settings, applyThemeSource })

  describe('getPreference', () => {
    it('reports system for a profile that never chose', () => {
      expect(service().getPreference()).toBe('system')
    })

    it('reports the persisted preference', () => {
      settings.rows.set(THEME_PREFERENCE_KEY, 'dark')

      expect(service().getPreference()).toBe('dark')
    })

    // The settings table is plain strings anything on the main side can
    // write. A row this contract does not recognize degrades to the default —
    // never a throw, and never a raw string handed to Electron.
    it('degrades a drifted persisted value to system instead of throwing', () => {
      settings.rows.set(THEME_PREFERENCE_KEY, 'sepia')

      expect(service().getPreference()).toBe('system')
    })

    it('reads without ever applying anything', () => {
      service().getPreference()

      expect(applyThemeSource).not.toHaveBeenCalled()
    })
  })

  describe('setPreference', () => {
    it('persists the preference under the theme key', () => {
      service().setPreference('light')

      expect(settings.set).toHaveBeenCalledWith(THEME_PREFERENCE_KEY, 'light')
    })

    it('applies the preference as the native theme source', () => {
      service().setPreference('dark')

      expect(applyThemeSource).toHaveBeenCalledTimes(1)
      expect(applyThemeSource).toHaveBeenCalledWith('dark')
    })

    it('returns the value it persisted, so the handler echoes reality', () => {
      expect(service().setPreference('dark')).toBe('dark')
    })

    it('round-trips through getPreference', () => {
      const themeService = service()

      themeService.setPreference('light')

      expect(themeService.getPreference()).toBe('light')
    })
  })

  describe('applyStoredPreference', () => {
    // The startup half of the feature: the window must open already resolving
    // `prefers-color-scheme` the way the student chose last session.
    it('applies the persisted preference at startup', () => {
      settings.rows.set(THEME_PREFERENCE_KEY, 'dark')

      service().applyStoredPreference()

      expect(applyThemeSource).toHaveBeenCalledWith('dark')
    })

    it('applies system when nothing was ever chosen', () => {
      service().applyStoredPreference()

      expect(applyThemeSource).toHaveBeenCalledWith('system')
    })

    it('persists nothing — startup is a read, not a decision', () => {
      service().applyStoredPreference()

      expect(settings.set).not.toHaveBeenCalled()
    })
  })
})
