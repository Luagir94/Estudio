import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppApiError, appApi } from './appApi'

describe('appApi', () => {
  beforeEach(() => {
    // @ts-expect-error -- test-only global bridge stub, no full Electron preload context
    globalThis.window = { api: { app: { openExternal: vi.fn(), exportJson: vi.fn(), onExportRequested: vi.fn() } } }
  })

  it('openExternal() forwards the url to the bridge on a successful envelope', async () => {
    window.api.app.openExternal = vi.fn().mockResolvedValue({ ok: true, data: undefined })

    await appApi.openExternal('https://campus.uni.edu/course/1')

    expect(window.api.app.openExternal).toHaveBeenCalledWith({ url: 'https://campus.uni.edu/course/1' })
  })

  it('openExternal() throws with the envelope error message when ok is false (refused scheme)', async () => {
    window.api.app.openExternal = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'URL_REFUSED', message: 'Only https URLs may be opened externally' }
    })

    await expect(appApi.openExternal('javascript:alert(1)')).rejects.toThrow('Only https URLs may be opened externally')
  })

  // The renderer maps its Spanish copy off the CODE, never `message`
  // (`shared/lib/ipcErrorCopy.ts`) — so the throw must carry it, exactly
  // like `CarrerasApiError`/`AdjuntosApiError`.
  it('openExternal() throws an AppApiError carrying the envelope code', async () => {
    window.api.app.openExternal = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'URL_REFUSED', message: 'Only https URLs may be opened externally' }
    })

    const error: unknown = await appApi.openExternal('javascript:alert(1)').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AppApiError)
    expect((error as AppApiError).code).toBe('URL_REFUSED')
    expect((error as Error).message).toBe('Only https URLs may be opened externally')
  })

  it('exportJson() parses and returns the envelope data on success', async () => {
    window.api.app.exportJson = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { canceled: false, filePath: '/docs/export.json' } })

    const result = await appApi.exportJson()

    expect(result).toEqual({ canceled: false, filePath: '/docs/export.json' })
  })

  it('exportJson() throws with the envelope error message when ok is false', async () => {
    window.api.app.exportJson = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'EXPORT_FAILED', message: 'disk full' } })

    await expect(appApi.exportJson()).rejects.toThrow('disk full')
  })

  it('exportJson() throws an AppApiError carrying the envelope code', async () => {
    window.api.app.exportJson = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'EXPORT_FAILED', message: 'disk full' } })

    const error: unknown = await appApi.exportJson().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AppApiError)
    expect((error as AppApiError).code).toBe('EXPORT_FAILED')
  })

  it('onExportRequested() forwards to the bridge and returns its unsubscribe function', () => {
    const unsubscribe = vi.fn()
    window.api.app.onExportRequested = vi.fn().mockReturnValue(unsubscribe)
    const callback = vi.fn()

    const result = appApi.onExportRequested(callback)

    expect(window.api.app.onExportRequested).toHaveBeenCalledWith(callback)
    expect(result).toBe(unsubscribe)
  })
})
