import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpService, McpStatus } from '../mcpService'

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

import { registerMcpHandlers } from './registerMcpHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const sampleStatus: McpStatus = {
  listener: 'stopped',
  listenerError: null,
  tokenIssuedAt: null,
  shimPath: 'C:\\app\\out\\mcp-shim\\index.cjs',
  endpoint: '\\\\.\\pipe\\course-companion-mcp-abcdef0123456789',
  permissions: [{ slice: 'materias', canRead: false, canWrite: false }]
}

describe('registerMcpHandlers', () => {
  let service: McpService

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    service = {
      reconcileListener: vi.fn(),
      issueToken: vi.fn().mockReturnValue({ token: 'cc_plaintext', issuedAt: '2026-09-02T12:00:00.000Z' }),
      revokeToken: vi.fn().mockReturnValue({ revoked: true }),
      shutdown: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue(sampleStatus),
      setPermission: vi.fn().mockReturnValue({ slice: 'materias', canRead: true, canWrite: false }),
      listActivity: vi.fn().mockReturnValue([])
    }
    registerMcpHandlers(service)
  })

  it('registers exactly the five mcp:* channels', () => {
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(5)
    for (const channel of [
      'mcp:status',
      'mcp:issueToken',
      'mcp:revokeToken',
      'mcp:setPermission',
      'mcp:listActivity'
    ]) {
      expect(ipcMainMock.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  // The security core this contract must not bypass (mission's own
  // "corrected dependency" note): every handler reaches the token
  // lifecycle, the listener reconcile and the audit trail ONLY through
  // `mcpService`, never through a repository it might otherwise import.
  it('calls mcpService for every channel, never a repository directly', () => {
    invoke('mcp:status')
    invoke('mcp:issueToken')
    invoke('mcp:revokeToken')
    invoke('mcp:setPermission', { slice: 'materias', canRead: true, canWrite: false })
    invoke('mcp:listActivity', {})

    expect(service.getStatus).toHaveBeenCalledTimes(1)
    expect(service.issueToken).toHaveBeenCalledTimes(1)
    expect(service.revokeToken).toHaveBeenCalledTimes(1)
    expect(service.setPermission).toHaveBeenCalledTimes(1)
    expect(service.listActivity).toHaveBeenCalledTimes(1)
  })

  describe('mcp:status', () => {
    it('returns the service status verbatim', () => {
      expect(invoke('mcp:status')).toEqual({ ok: true, data: sampleStatus })
    })

    it('returns STATUS_FAILED when the service throws', () => {
      service.getStatus = vi.fn().mockImplementation(() => {
        throw new Error('settings unavailable')
      })
      registerMcpHandlers(service)

      expect(invoke('mcp:status')).toEqual({
        ok: false,
        error: { code: 'STATUS_FAILED', message: 'settings unavailable' }
      })
      expect(logErrorMock).toHaveBeenCalledWith('mcp:status failed', expect.any(Error))
    })
  })

  describe('mcp:issueToken', () => {
    it('returns the freshly-issued plaintext token and issuedAt', () => {
      expect(invoke('mcp:issueToken')).toEqual({
        ok: true,
        data: { token: 'cc_plaintext', issuedAt: '2026-09-02T12:00:00.000Z' }
      })
    })

    it('returns ISSUE_TOKEN_FAILED when the service throws', () => {
      service.issueToken = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerMcpHandlers(service)

      expect(invoke('mcp:issueToken')).toEqual({
        ok: false,
        error: { code: 'ISSUE_TOKEN_FAILED', message: 'database is locked' }
      })
    })
  })

  describe('mcp:revokeToken', () => {
    it('returns revoked: true', () => {
      expect(invoke('mcp:revokeToken')).toEqual({ ok: true, data: { revoked: true } })
    })

    it('returns REVOKE_TOKEN_FAILED when the service throws', () => {
      service.revokeToken = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerMcpHandlers(service)

      expect(invoke('mcp:revokeToken')).toEqual({
        ok: false,
        error: { code: 'REVOKE_TOKEN_FAILED', message: 'database is locked' }
      })
    })
  })

  describe('mcp:setPermission', () => {
    it('parses a valid payload and hands the service the PARSED slice/canRead/canWrite', () => {
      const result = invoke('mcp:setPermission', { slice: 'carreras', canRead: true, canWrite: false })

      expect(service.setPermission).toHaveBeenCalledWith({ slice: 'carreras', canRead: true, canWrite: false })
      expect(result).toEqual({ ok: true, data: { slice: 'materias', canRead: true, canWrite: false } })
    })

    it('rejects a slice outside the 8 curated ones without calling the service', () => {
      const result = invoke('mcp:setPermission', { slice: 'adjuntos', canRead: true, canWrite: false })

      expect(service.setPermission).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })

    it('returns SET_PERMISSION_FAILED when the service throws', () => {
      service.setPermission = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerMcpHandlers(service)

      const result = invoke('mcp:setPermission', { slice: 'materias', canRead: true, canWrite: false })

      expect(result).toEqual({
        ok: false,
        error: { code: 'SET_PERMISSION_FAILED', message: 'database is locked' }
      })
    })

    it('does not log an expected validation failure', () => {
      invoke('mcp:setPermission', {})

      expect(logErrorMock).not.toHaveBeenCalled()
    })
  })

  describe('mcp:listActivity', () => {
    it('accepts an empty payload and returns the newest-first list', () => {
      const rows = [
        {
          id: 2,
          occurredAt: '2026-09-02T12:00:01.000Z',
          tool: 'materias_list',
          slice: 'materias',
          action: 'read' as const,
          outcome: 'success' as const,
          summary: 'materias_list -> 3 rows',
          clientName: null,
          errorCode: null
        }
      ]
      service.listActivity = vi.fn().mockReturnValue(rows)
      registerMcpHandlers(service)

      expect(invoke('mcp:listActivity', {})).toEqual({ ok: true, data: rows })
      expect(service.listActivity).toHaveBeenCalledWith(undefined)
    })

    it('passes a given limit through to the service', () => {
      invoke('mcp:listActivity', { limit: 50 })

      expect(service.listActivity).toHaveBeenCalledWith(50)
    })

    it('rejects a limit above the 500-row cap without calling the service', () => {
      const result = invoke('mcp:listActivity', { limit: 501 })

      expect(service.listActivity).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })

    it('returns LIST_ACTIVITY_FAILED when the service throws', () => {
      service.listActivity = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerMcpHandlers(service)

      expect(invoke('mcp:listActivity', {})).toEqual({
        ok: false,
        error: { code: 'LIST_ACTIVITY_FAILED', message: 'database is locked' }
      })
    })
  })
})
