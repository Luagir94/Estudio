import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AjustesApiError, ajustesApi } from './ajustesApi'

const sampleStatus = {
  provider: 'claude' as const,
  status: 'connected' as const,
  version: '2.1.220',
  resolvedPath: 'C:\\nvm4w\\nodejs\\claude.cmd',
  source: 'auto' as const,
  overridePath: null,
  detail: null,
  failureReason: null,
  capabilities: { structuredOutput: true, warmSession: true, readOnlyTools: true }
}

describe('ajustesApi', () => {
  beforeEach(() => {
    // @ts-expect-error -- test-only global bridge stub, no full Electron preload context
    globalThis.window = {
      api: {
        ask: {
          question: vi.fn(),
          cancel: vi.fn(),
          listConversations: vi.fn(),
          getConversation: vi.fn(),
          deleteConversation: vi.fn()
        },
        cli: { probe: vi.fn(), setOverride: vi.fn(), preferences: vi.fn(), disconnect: vi.fn(), models: vi.fn() },
        theme: { getPreference: vi.fn(), setPreference: vi.fn() },
        materias: {
          create: vi.fn(),
          list: vi.fn(),
          detail: vi.fn(),
          updateSchedule: vi.fn(),
          delete: vi.fn(),
          setOutcome: vi.fn()
        },
        horario: { week: vi.fn() },
        hoy: { dashboard: vi.fn() },
        carreras: {
          create: vi.fn(),
          list: vi.fn(),
          detail: vi.fn(),
          update: vi.fn(),
          createPeriod: vi.fn(),
          updatePeriod: vi.fn(),
          deletePeriod: vi.fn(),
          delete: vi.fn()
        },
        finales: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        entregas: { create: vi.fn(), list: vi.fn(), update: vi.fn(), setDone: vi.fn(), delete: vi.fn() },
        adjuntos: { list: vi.fn(), add: vi.fn(), open: vi.fn(), remove: vi.fn(), read: vi.fn(), write: vi.fn() },
        indexado: { sync: vi.fn(), onStatusChanged: vi.fn().mockReturnValue(vi.fn()) },
        app: { openExternal: vi.fn(), exportJson: vi.fn(), onExportRequested: vi.fn() }
      }
    }
  })

  describe('probe', () => {
    it('parses and returns the status DTO on a successful envelope', async () => {
      window.api.cli.probe = vi.fn().mockResolvedValue({ ok: true, data: sampleStatus })

      const result = await ajustesApi.probe({ provider: 'claude' })

      expect(result).toEqual(sampleStatus)
    })

    // The provider crosses the bridge on every probe: main resolves the
    // executable name and the settings key from it, so a probe that forgot to
    // name one would be a probe of nothing in particular.
    it('names the provider it is asking about', async () => {
      window.api.cli.probe = vi.fn().mockResolvedValue({ ok: true, data: { ...sampleStatus, provider: 'codex' } })

      await ajustesApi.probe({ provider: 'codex' })

      expect(window.api.cli.probe).toHaveBeenCalledWith({ provider: 'codex' })
    })

    it('throws an AjustesApiError carrying the envelope code and message when ok is false', async () => {
      window.api.cli.probe = vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'PROBE_FAILED', message: 'spawn exploded' } })

      const error: unknown = await ajustesApi.probe({ provider: 'claude' }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(AjustesApiError)
      expect((error as AjustesApiError).code).toBe('PROBE_FAILED')
      expect((error as Error).message).toBe('spawn exploded')
    })

    it('throws when the envelope data does not match the status schema (zod parses before react-query sees it)', async () => {
      window.api.cli.probe = vi.fn().mockResolvedValue({ ok: true, data: { status: 'connected', version: 123 } })

      await expect(ajustesApi.probe({ provider: 'claude' })).rejects.toThrow()
    })
  })

  describe('setOverride', () => {
    it('parses and returns the status DTO after persisting a path override', async () => {
      const overriddenStatus = { ...sampleStatus, source: 'override' as const, overridePath: 'C:\\bin\\claude.cmd' }
      window.api.cli.setOverride = vi.fn().mockResolvedValue({ ok: true, data: overriddenStatus })

      const result = await ajustesApi.setOverride({ provider: 'claude', path: 'C:\\bin\\claude.cmd' })

      expect(result).toEqual(overriddenStatus)
      expect(window.api.cli.setOverride).toHaveBeenCalledWith({ provider: 'claude', path: 'C:\\bin\\claude.cmd' })
    })

    it('sends null to clear the override', async () => {
      window.api.cli.setOverride = vi.fn().mockResolvedValue({ ok: true, data: sampleStatus })

      await ajustesApi.setOverride({ provider: 'claude', path: null })

      expect(window.api.cli.setOverride).toHaveBeenCalledWith({ provider: 'claude', path: null })
    })

    it('throws an AjustesApiError when ok is false', async () => {
      window.api.cli.setOverride = vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'SET_OVERRIDE_FAILED', message: 'disk is full' } })

      await expect(ajustesApi.setOverride({ provider: 'claude', path: 'C:\\bin\\claude.cmd' })).rejects.toThrow(
        'disk is full'
      )
    })
  })

  describe('themePreference', () => {
    it('parses and returns the preference on a successful envelope', async () => {
      window.api.theme.getPreference = vi.fn().mockResolvedValue({ ok: true, data: 'dark' })

      await expect(ajustesApi.themePreference()).resolves.toBe('dark')
    })

    it('throws an AjustesApiError carrying the envelope code when ok is false', async () => {
      window.api.theme.getPreference = vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'THEME_READ_FAILED', message: 'settings table exploded' } })

      const error: unknown = await ajustesApi.themePreference().catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(AjustesApiError)
      expect((error as AjustesApiError).code).toBe('THEME_READ_FAILED')
    })

    // The renderer side of the two-directional parsing rule: a value outside
    // the shared enum must fail loudly here, never reach react-query's cache.
    it('throws when the envelope data is not a known preference', async () => {
      window.api.theme.getPreference = vi.fn().mockResolvedValue({ ok: true, data: 'sepia' })

      await expect(ajustesApi.themePreference()).rejects.toThrow()
    })
  })

  describe('setThemePreference', () => {
    it('names the preference it is setting and returns the echoed value', async () => {
      window.api.theme.setPreference = vi.fn().mockResolvedValue({ ok: true, data: 'light' })

      await expect(ajustesApi.setThemePreference({ preference: 'light' })).resolves.toBe('light')
      expect(window.api.theme.setPreference).toHaveBeenCalledWith({ preference: 'light' })
    })

    it('throws an AjustesApiError when ok is false', async () => {
      window.api.theme.setPreference = vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'THEME_WRITE_FAILED', message: 'disk is full' } })

      await expect(ajustesApi.setThemePreference({ preference: 'dark' })).rejects.toThrow('disk is full')
    })
  })
})
