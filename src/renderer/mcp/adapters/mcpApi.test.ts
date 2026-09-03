// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { McpApiError, mcpApi } from './mcpApi'

const sampleStatus = {
  listener: 'listening' as const,
  listenerError: null,
  tokenIssuedAt: '2026-09-03T10:00:00.000Z',
  shimPath: 'C:\\app\\resources\\mcp-shim\\index.cjs',
  endpoint: '\\\\.\\pipe\\course-companion-mcp-abc123',
  permissions: [{ slice: 'materias' as const, canRead: true, canWrite: false }]
}

describe('mcpApi', () => {
  beforeEach(() => {
    // @ts-expect-error test-only global bridge stub, no full Electron preload context
    window.api = { mcp: { status: vi.fn(), issueToken: vi.fn(), revokeToken: vi.fn() } }
  })

  it('status parses and returns the listener status on success', async () => {
    vi.mocked(window.api.mcp.status).mockResolvedValue({ ok: true, data: sampleStatus })

    expect(await mcpApi.status()).toEqual(sampleStatus)
  })

  it('status throws McpApiError, preserving the envelope code, on failure', async () => {
    vi.mocked(window.api.mcp.status).mockResolvedValue({
      ok: false,
      error: { code: 'MCP_STATUS_FAILED', message: 'boom' }
    })

    await expect(mcpApi.status()).rejects.toMatchObject({ code: 'MCP_STATUS_FAILED' })
  })

  it('issueToken returns the plaintext token and its issued timestamp', async () => {
    vi.mocked(window.api.mcp.issueToken).mockResolvedValue({
      ok: true,
      data: { token: 'cc_mcp_freshtoken', issuedAt: '2026-09-03T11:00:00.000Z' }
    })

    const result = await mcpApi.issueToken()

    expect(result).toEqual({ token: 'cc_mcp_freshtoken', issuedAt: '2026-09-03T11:00:00.000Z' })
  })

  it('revokeToken resolves once the envelope confirms revocation', async () => {
    vi.mocked(window.api.mcp.revokeToken).mockResolvedValue({ ok: true, data: { revoked: true } })

    await expect(mcpApi.revokeToken()).resolves.toEqual({ revoked: true })
  })

  it('revokeToken throws McpApiError, distinct from another feature\u2019s ApiError class, on failure', async () => {
    vi.mocked(window.api.mcp.revokeToken).mockResolvedValue({
      ok: false,
      error: { code: 'MCP_REVOKE_FAILED', message: 'boom' }
    })

    await expect(mcpApi.revokeToken()).rejects.toBeInstanceOf(McpApiError)
  })
})
