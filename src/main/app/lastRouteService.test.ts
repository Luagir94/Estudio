import { beforeEach, describe, expect, it, vi } from 'vitest'

const logWarnMock = vi.hoisted(() => vi.fn())
vi.mock('electron-log', () => ({ default: { warn: logWarnMock } }))

import { createLastRouteService, LAST_ROUTE_KEY } from './lastRouteService'

/**
 * In-memory stand-in for the generic app-settings store — same fake shape as
 * `themeService.test.ts`'s `createFakeSettings`.
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

describe('createLastRouteService', () => {
  let settings: ReturnType<typeof createFakeSettings>

  beforeEach(() => {
    settings = createFakeSettings()
    logWarnMock.mockReset()
  })

  const service = () => createLastRouteService({ settings })

  describe('launchHash', () => {
    it('returns null when nothing was ever persisted', () => {
      expect(service().launchHash()).toBeNull()
    })

    it('returns the persisted route when it is syntactically valid', () => {
      settings.rows.set(LAST_ROUTE_KEY, '/carreras/3?tab=plan')

      expect(service().launchHash()).toBe('/carreras/3?tab=plan')
    })

    it('returns null for a persisted value that fails the syntactic guard', () => {
      settings.rows.set(LAST_ROUTE_KEY, '//evil')

      expect(service().launchHash()).toBeNull()
    })
  })

  describe('remember', () => {
    it('extracts and persists the hash from a file:// URL', () => {
      service().remember('file:///C:/app/index.html#/carreras/3?tab=plan')

      expect(settings.set).toHaveBeenCalledWith(LAST_ROUTE_KEY, '/carreras/3?tab=plan')
    })

    it('extracts and persists the hash from an http:// URL', () => {
      service().remember('http://localhost:5173/#/hoy')

      expect(settings.set).toHaveBeenCalledWith(LAST_ROUTE_KEY, '/hoy')
    })

    it('does nothing when the URL has no hash', () => {
      service().remember('file:///C:/app/index.html')

      expect(settings.set).not.toHaveBeenCalled()
    })

    it('skips writing when the extracted hash equals the already-persisted value', () => {
      settings.rows.set(LAST_ROUTE_KEY, '/hoy')
      settings.set.mockClear()

      service().remember('file:///C:/app/index.html#/hoy')

      expect(settings.set).not.toHaveBeenCalled()
    })

    it('swallows a throwing settings.set without rethrowing', () => {
      settings.set.mockImplementation(() => {
        throw new Error('disk full')
      })

      expect(() => service().remember('file:///C:/app/index.html#/hoy')).not.toThrow()
      expect(logWarnMock).toHaveBeenCalledTimes(1)
    })
  })
})
