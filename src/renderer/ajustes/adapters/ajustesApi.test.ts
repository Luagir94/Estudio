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
  capabilities: { structuredOutput: true, warmSession: true, readOnlyTools: true }
}

/** `cli:status` answers with one entry per supported provider. */
const sampleStatuses = [sampleStatus]

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
        cli: { status: vi.fn(), setOverride: vi.fn(), models: vi.fn() },
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
        adjuntos: { list: vi.fn(), add: vi.fn(), open: vi.fn(), remove: vi.fn() },
        app: { openExternal: vi.fn(), exportJson: vi.fn(), onExportRequested: vi.fn() }
      }
    }
  })

  describe('status', () => {
    it('parses and returns the status DTO on a successful envelope', async () => {
      window.api.cli.status = vi.fn().mockResolvedValue({ ok: true, data: sampleStatuses })

      const result = await ajustesApi.status()

      expect(result).toEqual(sampleStatuses)
      expect(window.api.cli.status).toHaveBeenCalledWith()
    })

    it('throws an AjustesApiError carrying the envelope code and message when ok is false', async () => {
      window.api.cli.status = vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'PROBE_FAILED', message: 'spawn exploded' } })

      const error: unknown = await ajustesApi.status().catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(AjustesApiError)
      expect((error as AjustesApiError).code).toBe('PROBE_FAILED')
      expect((error as Error).message).toBe('spawn exploded')
    })

    it('throws when the envelope data does not match the status schema (zod parses before react-query sees it)', async () => {
      window.api.cli.status = vi.fn().mockResolvedValue({ ok: true, data: [{ status: 'connected', version: 123 }] })

      await expect(ajustesApi.status()).rejects.toThrow()
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
})
