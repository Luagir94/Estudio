import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemePreference } from '../../shared/ipc/theme'
import { createThemeService, PALETTE_KEY, THEME_PREFERENCE_KEY } from './themeService'

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

  // The palette half is pure persistence: it has no `nativeTheme` counterpart
  // to apply, because which token block wins is a `data-palette` attribute
  // the renderer owns, not a switch Electron controls.
  describe('getPalette', () => {
    it('reports amatista for a profile that never chose', () => {
      expect(service().getPalette()).toBe('amatista')
    })

    it('reports the persisted palette', () => {
      settings.rows.set(PALETTE_KEY, 'cuarzo')

      expect(service().getPalette()).toBe('cuarzo')
    })

    // A drifted row here is quieter than a drifted theme row — the value ends
    // up in a DOM attribute, and an attribute selector nobody matches paints
    // the base palette without complaining. So it degrades on the read side.
    it('degrades a drifted persisted value to amatista instead of throwing', () => {
      settings.rows.set(PALETTE_KEY, 'violeta')

      expect(service().getPalette()).toBe('amatista')
    })

    it('reads without ever applying a native theme source', () => {
      service().getPalette()

      expect(applyThemeSource).not.toHaveBeenCalled()
    })
  })

  describe('setPalette', () => {
    it('persists the palette under its own key', () => {
      service().setPalette('malva')

      expect(settings.set).toHaveBeenCalledWith(PALETTE_KEY, 'malva')
    })

    it('returns the value it persisted, so the handler echoes reality', () => {
      expect(service().setPalette('grafito')).toBe('grafito')
    })

    it('round-trips through getPalette', () => {
      const themeService = service()

      themeService.setPalette('turquesa')

      expect(themeService.getPalette()).toBe('turquesa')
    })

    // The two axes are orthogonal. Choosing a palette must not touch
    // `themeSource`, or picking a colour would quietly override light/dark.
    it('never applies a native theme source', () => {
      service().setPalette('cobalto')

      expect(applyThemeSource).not.toHaveBeenCalled()
    })

    it('leaves the theme preference untouched', () => {
      const themeService = service()

      themeService.setPreference('dark')
      themeService.setPalette('cobalto')

      expect(themeService.getPreference()).toBe('dark')
      expect(themeService.getPalette()).toBe('cobalto')
    })
  })
})
