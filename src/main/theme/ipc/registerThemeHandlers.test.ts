import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeService } from '../themeService'

const { ipcMainMock } = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
  return {
    ipcMainMock: {
      handlers,
      handle: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener)
      })
    }
  }
})

const logErrorMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ ipcMain: ipcMainMock }))
vi.mock('electron-log', () => ({ default: { error: logErrorMock } }))

import { registerThemeHandlers } from './registerThemeHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

/**
 * Handler-only tests, same scope rule as `registerCliHandlers.test.ts`: every
 * channel returns an `IpcResult`, zod parses the payload, nothing ever throws
 * across the bridge. Persisting and applying belong to `themeService` and are
 * tested there; this file only proves the handlers compose it correctly.
 */
describe('registerThemeHandlers', () => {
  let themeService: ThemeService

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    vi.clearAllMocks()
    themeService = {
      getPreference: vi.fn(() => 'system' as const),
      setPreference: vi.fn((preference) => preference),
      applyStoredPreference: vi.fn()
    }
    registerThemeHandlers({ themeService })
  })

  describe('theme:getPreference', () => {
    it('returns the current preference in the ok envelope', async () => {
      themeService.getPreference = vi.fn(() => 'dark' as const)

      const result = await invoke('theme:getPreference')

      expect(result).toEqual({ ok: true, data: 'dark' })
    })

    it('never throws across the bridge when the service does', async () => {
      themeService.getPreference = vi.fn(() => {
        throw new Error('settings table exploded')
      })

      const result = (await invoke('theme:getPreference')) as { ok: boolean; error: { code: string } }

      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('THEME_READ_FAILED')
    })
  })

  describe('theme:setPreference', () => {
    it('sets the named preference and echoes the persisted value', async () => {
      const result = await invoke('theme:setPreference', { preference: 'light' })

      expect(result).toEqual({ ok: true, data: 'light' })
      expect(themeService.setPreference).toHaveBeenCalledTimes(1)
      expect(themeService.setPreference).toHaveBeenCalledWith('light')
    })

    it.each([
      ['an empty payload', {}],
      ['no payload at all', undefined],
      ['a preference outside the union', { preference: 'sepia' }]
    ])('rejects %s without touching the service', async (_label, payload) => {
      const result = (await invoke('theme:setPreference', payload)) as { ok: boolean; error: { code: string } }

      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('VALIDATION_ERROR')
      expect(themeService.setPreference).not.toHaveBeenCalled()
    })

    it('never throws across the bridge when the service does', async () => {
      themeService.setPreference = vi.fn(() => {
        throw new Error('disk is full')
      })

      const result = (await invoke('theme:setPreference', { preference: 'dark' })) as {
        ok: boolean
        error: { code: string }
      }

      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('THEME_WRITE_FAILED')
    })

    it('logs the unexpected write failure with its channel name', async () => {
      themeService.setPreference = vi.fn(() => {
        throw new Error('disk is full')
      })

      await invoke('theme:setPreference', { preference: 'dark' })

      expect(logErrorMock).toHaveBeenCalledWith('theme:setPreference failed', expect.any(Error))
    })
  })
})
