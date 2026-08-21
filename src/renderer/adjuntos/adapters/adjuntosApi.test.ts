import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdjuntosApiError, adjuntosApi } from './adjuntosApi'

const sampleAttachment = {
  id: 1,
  subjectId: 10,
  fileName: 'apuntes.pdf',
  mimeType: null,
  sizeBytes: 2516582,
  title: null,
  createdAt: '2026-08-12T10:00',
  indexStatus: 'pending'
}

describe('adjuntosApi', () => {
  beforeEach(() => {
    // @ts-expect-error -- test-only global bridge stub, no full Electron preload context
    globalThis.window = {
      api: {
        adjuntos: {
          list: vi.fn(),
          add: vi.fn(),
          open: vi.fn(),
          remove: vi.fn()
        },
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
        app: { openExternal: vi.fn(), exportJson: vi.fn(), onExportRequested: vi.fn() },
        ask: {
          question: vi.fn(),
          cancel: vi.fn(),
          listConversations: vi.fn(),
          getConversation: vi.fn(),
          deleteConversation: vi.fn()
        },
        cli: { probe: vi.fn(), setOverride: vi.fn(), preferences: vi.fn(), disconnect: vi.fn(), models: vi.fn() }
      }
    }
  })

  describe('list', () => {
    it('parses and returns the attachment array on a successful envelope', async () => {
      window.api.adjuntos.list = vi.fn().mockResolvedValue({ ok: true, data: [sampleAttachment] })

      const result = await adjuntosApi.list(10)

      expect(result).toEqual([sampleAttachment])
      expect(window.api.adjuntos.list).toHaveBeenCalledWith(10)
    })

    it('throws an AdjuntosApiError carrying the envelope code and message when ok is false', async () => {
      window.api.adjuntos.list = vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'LIST_FAILED', message: 'database is locked' } })

      const error: unknown = await adjuntosApi.list(10).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(AdjuntosApiError)
      expect((error as AdjuntosApiError).code).toBe('LIST_FAILED')
      expect((error as Error).message).toBe('database is locked')
    })
  })

  describe('add', () => {
    it('parses and returns the add result (added + failures) on success', async () => {
      const addResult = {
        canceled: false,
        added: [sampleAttachment],
        failures: [{ fileName: 'Clase 4.mp4', code: 'FILE_TOO_LARGE', message: 'Clase 4.mp4 exceeds the limit' }]
      }
      window.api.adjuntos.add = vi.fn().mockResolvedValue({ ok: true, data: addResult })

      const result = await adjuntosApi.add(10)

      expect(result).toEqual(addResult)
      expect(window.api.adjuntos.add).toHaveBeenCalledWith({ subjectId: 10 })
    })

    it('throws an AdjuntosApiError when ok is false', async () => {
      window.api.adjuntos.add = vi.fn().mockResolvedValue({ ok: false, error: { code: 'ADD_FAILED', message: 'boom' } })

      await expect(adjuntosApi.add(10)).rejects.toThrow('boom')
    })
  })

  describe('open', () => {
    it('resolves without a value on success', async () => {
      window.api.adjuntos.open = vi.fn().mockResolvedValue({ ok: true, data: undefined })

      await expect(adjuntosApi.open(1)).resolves.toBeUndefined()
      expect(window.api.adjuntos.open).toHaveBeenCalledWith(1)
    })

    it('throws an AdjuntosApiError carrying the ATTACHMENT_FILE_MISSING code when the file is gone', async () => {
      window.api.adjuntos.open = vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'ATTACHMENT_FILE_MISSING', message: 'file is gone' } })

      const error: unknown = await adjuntosApi.open(1).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(AdjuntosApiError)
      expect((error as AdjuntosApiError).code).toBe('ATTACHMENT_FILE_MISSING')
    })
  })

  describe('delete', () => {
    it('parses and returns the delete result on success', async () => {
      window.api.adjuntos.remove = vi.fn().mockResolvedValue({ ok: true, data: { id: 1, fileRemoved: true } })

      const result = await adjuntosApi.delete(1)

      expect(result).toEqual({ id: 1, fileRemoved: true })
      expect(window.api.adjuntos.remove).toHaveBeenCalledWith(1)
    })

    it('throws an AdjuntosApiError when ok is false', async () => {
      window.api.adjuntos.remove = vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'DELETE_FAILED', message: 'nope' } })

      await expect(adjuntosApi.delete(1)).rejects.toThrow('nope')
    })
  })
})
