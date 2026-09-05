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

import type { ClientConfigWriter } from '../adapters/clientConfigWriter'
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

const sampleTargetStatus = {
  target: 'claude-code' as const,
  configPath: 'C:\\Users\\lucia\\.claude.json',
  detected: true,
  connected: false
}

describe('registerMcpHandlers', () => {
  let service: McpService
  let writer: ClientConfigWriter

  beforeEach(() => {
    writer = {
      list: vi.fn().mockResolvedValue([sampleTargetStatus]),
      write: vi.fn().mockResolvedValue({
        ok: true,
        result: { target: 'claude-code', configPath: sampleTargetStatus.configPath, changed: true, backupPath: null }
      }),
      remove: vi.fn().mockResolvedValue({
        ok: true,
        result: { target: 'claude-code', configPath: sampleTargetStatus.configPath, changed: true, backupPath: null }
      })
    }
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
    registerMcpHandlers(service, writer)
  })

  it('registers exactly the eight mcp:* channels', () => {
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(8)
    for (const channel of [
      'mcp:status',
      'mcp:issueToken',
      'mcp:revokeToken',
      'mcp:setPermission',
      'mcp:listActivity',
      'mcp:listClientTargets',
      'mcp:writeClientConfig',
      'mcp:removeClientConfig'
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
      registerMcpHandlers(service, writer)

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
      registerMcpHandlers(service, writer)

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
      registerMcpHandlers(service, writer)

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
      registerMcpHandlers(service, writer)

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
      registerMcpHandlers(service, writer)

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
      registerMcpHandlers(service, writer)

      expect(invoke('mcp:listActivity', {})).toEqual({
        ok: false,
        error: { code: 'LIST_ACTIVITY_FAILED', message: 'database is locked' }
      })
    })
  })

  describe('mcp:listClientTargets', () => {
    it('returns what the writer observed on disk', async () => {
      expect(await invoke('mcp:listClientTargets')).toEqual({ ok: true, data: [sampleTargetStatus] })
    })

    it('returns LIST_CLIENT_TARGETS_FAILED when the writer throws', async () => {
      writer.list = vi.fn().mockRejectedValue(new Error('home directory is gone'))
      registerMcpHandlers(service, writer)

      expect(await invoke('mcp:listClientTargets')).toEqual({
        ok: false,
        error: { code: 'LIST_CLIENT_TARGETS_FAILED', message: 'home directory is gone' }
      })
    })
  })

  describe('mcp:writeClientConfig', () => {
    // The entry is main's to build: a renderer that could name `command` or
    // `args` could point a client at any executable on the machine.
    it('builds the entry from the service shim path and the caller token', async () => {
      await invoke('mcp:writeClientConfig', { target: 'claude-code', token: 'cc_mcp_abc123' })

      expect(writer.write).toHaveBeenCalledWith('claude-code', {
        command: 'node',
        args: [sampleStatus.shimPath],
        env: { COURSE_COMPANION_MCP_TOKEN: 'cc_mcp_abc123' }
      })
    })

    it('rejects a target this build does not enable, without touching the writer', async () => {
      const result = await invoke('mcp:writeClientConfig', { target: 'cursor', token: 'cc_mcp_abc123' })

      expect(writer.write).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })

    it('rejects an empty token without touching the writer', async () => {
      const result = await invoke('mcp:writeClientConfig', { target: 'claude-code', token: '' })

      expect(writer.write).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })

    // A refusal is the channel earning its keep: the alternative to reporting
    // "not valid JSON" is silently destroying the file that held it.
    it('surfaces the writer own refusal code rather than a generic failure', async () => {
      writer.write = vi.fn().mockResolvedValue({ ok: false, code: 'CONFIG_NOT_UNDERSTOOD', message: 'not valid JSON' })
      registerMcpHandlers(service, writer)

      expect(await invoke('mcp:writeClientConfig', { target: 'claude-code', token: 'cc_mcp_abc123' })).toEqual({
        ok: false,
        error: { code: 'CONFIG_NOT_UNDERSTOOD', message: 'not valid JSON' }
      })
    })

    it('returns WRITE_CLIENT_CONFIG_FAILED when the writer throws', async () => {
      writer.write = vi.fn().mockRejectedValue(new Error('disk full'))
      registerMcpHandlers(service, writer)

      expect(await invoke('mcp:writeClientConfig', { target: 'claude-code', token: 'cc_mcp_abc123' })).toEqual({
        ok: false,
        error: { code: 'WRITE_CLIENT_CONFIG_FAILED', message: 'disk full' }
      })
    })
  })

  describe('mcp:removeClientConfig', () => {
    it('asks the writer to drop the entry for the named target', async () => {
      expect(await invoke('mcp:removeClientConfig', { target: 'claude-code' })).toMatchObject({ ok: true })
      expect(writer.remove).toHaveBeenCalledWith('claude-code')
    })

    it('rejects a target this build does not enable', async () => {
      const result = await invoke('mcp:removeClientConfig', { target: 'claude-desktop' })

      expect(writer.remove).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })

    it('returns REMOVE_CLIENT_CONFIG_FAILED when the writer throws', async () => {
      writer.remove = vi.fn().mockRejectedValue(new Error('read-only filesystem'))
      registerMcpHandlers(service, writer)

      expect(await invoke('mcp:removeClientConfig', { target: 'claude-code' })).toEqual({
        ok: false,
        error: { code: 'REMOVE_CLIENT_CONFIG_FAILED', message: 'read-only filesystem' }
      })
    })
  })
})
