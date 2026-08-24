import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IndexadoApiError, indexadoApi } from './indexadoApi'

describe('indexadoApi', () => {
  beforeEach(() => {
    // @ts-expect-error -- test-only global bridge stub, no full Electron preload context
    globalThis.window = { api: { indexado: { sync: vi.fn(), onStatusChanged: vi.fn() } } }
  })

  it('sync() parses and returns the enqueued count on a successful envelope', async () => {
    window.api.indexado.sync = vi.fn().mockResolvedValue({ ok: true, data: { enqueued: 3 } })

    const result = await indexadoApi.sync()

    expect(result).toEqual({ enqueued: 3 })
  })

  // The renderer maps its Spanish copy off the CODE, never `message`
  // (`shared/lib/ipcErrorCopy.ts`) — so the throw must carry it, exactly
  // like `CarrerasApiError`/`AdjuntosApiError`.
  it('sync() throws an IndexadoApiError carrying the envelope code', async () => {
    window.api.indexado.sync = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'SYNC_FAILED', message: 'database is locked' } })

    const error: unknown = await indexadoApi.sync().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(IndexadoApiError)
    expect((error as IndexadoApiError).code).toBe('SYNC_FAILED')
    expect((error as Error).message).toBe('database is locked')
  })

  it('onStatusChanged() forwards to the bridge and returns its unsubscribe function', () => {
    const unsubscribe = vi.fn()
    window.api.indexado.onStatusChanged = vi.fn().mockReturnValue(unsubscribe)
    const callback = vi.fn()

    const result = indexadoApi.onStatusChanged(callback)

    expect(window.api.indexado.onStatusChanged).toHaveBeenCalledWith(callback)
    expect(result).toBe(unsubscribe)
  })
})
