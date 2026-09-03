// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { McpActivityApiError, mcpActivityApi } from './mcpActivityApi'

const sampleEntry = {
  id: 42,
  occurredAt: '2026-09-03T12:00:00.000Z',
  tool: 'fechas_create',
  slice: 'fechas' as const,
  action: 'write' as const,
  outcome: 'success' as const,
  summary: 'fechas#7 creada',
  clientName: 'claude-code',
  errorCode: null
}

describe('mcpActivityApi', () => {
  beforeEach(() => {
    // @ts-expect-error test-only global bridge stub, no full Electron preload context
    window.api = { mcp: { listActivity: vi.fn(), onActivityChanged: vi.fn() } }
  })

  it('listActivity parses and returns the newest-first audit rows on success', async () => {
    vi.mocked(window.api.mcp.listActivity).mockResolvedValue({ ok: true, data: [sampleEntry] })

    const result = await mcpActivityApi.listActivity()

    expect(result).toEqual([sampleEntry])
  })

  it('listActivity forwards its input (limit) to the bridge unchanged', async () => {
    vi.mocked(window.api.mcp.listActivity).mockResolvedValue({ ok: true, data: [] })

    await mcpActivityApi.listActivity({ limit: 50 })

    expect(window.api.mcp.listActivity).toHaveBeenCalledWith({ limit: 50 })
  })

  it('listActivity defaults to no input when called with none', async () => {
    vi.mocked(window.api.mcp.listActivity).mockResolvedValue({ ok: true, data: [] })

    await mcpActivityApi.listActivity()

    expect(window.api.mcp.listActivity).toHaveBeenCalledWith({})
  })

  it('listActivity throws McpActivityApiError, preserving the envelope code, on failure', async () => {
    vi.mocked(window.api.mcp.listActivity).mockResolvedValue({
      ok: false,
      error: { code: 'LIST_ACTIVITY_FAILED', message: 'boom' }
    })

    await expect(mcpActivityApi.listActivity()).rejects.toMatchObject({ code: 'LIST_ACTIVITY_FAILED' })
    await expect(mcpActivityApi.listActivity()).rejects.toBeInstanceOf(McpActivityApiError)
  })

  // A malformed row is an app bug (main and renderer schemas drifted), not a
  // reportable IPC outcome — it must fail as the schema's own error, never
  // reach a caller as trusted data (same convention `planificadorApi.test.ts`
  // holds for its own "malformed success payload" case).
  it('listActivity rejects a malformed row instead of silently returning it (untrusted display data)', async () => {
    vi.mocked(window.api.mcp.listActivity).mockResolvedValue({
      ok: true,
      data: [{ ...sampleEntry, outcome: 'not-a-real-outcome' }]
    } as never)

    await expect(mcpActivityApi.listActivity()).rejects.toThrow()
  })

  it('onActivityChanged forwards the callback to the bridge and returns its unsubscribe function', () => {
    const unsubscribe = vi.fn()
    vi.mocked(window.api.mcp.onActivityChanged).mockReturnValue(unsubscribe)
    const callback = vi.fn()

    const result = mcpActivityApi.onActivityChanged(callback)

    expect(window.api.mcp.onActivityChanged).toHaveBeenCalledWith(callback)
    expect(result).toBe(unsubscribe)
  })

  it('onActivityChanged unsubscribe actually calls through to the bridge-returned remover (no leaked listener)', () => {
    const unsubscribe = vi.fn()
    vi.mocked(window.api.mcp.onActivityChanged).mockReturnValue(unsubscribe)

    const stopListening = mcpActivityApi.onActivityChanged(vi.fn())
    stopListening()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
