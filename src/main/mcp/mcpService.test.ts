import { Duplex } from 'node:stream'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { encodeAck } from '../../shared/mcp/handshake'
import type { McpAuditEntryInput, McpAuditRepository } from './adapters/sqliteMcpAuditRepository'
import { createConnectionState } from './adapters/mcpServerFactory'
import type { McpPermissionRepository } from './adapters/sqliteMcpPermissionRepository'
import { generateToken, hashToken } from './domain/token'
import type { ToolDescriptor } from './domain/toolDescriptor'

const logInfoMock = vi.hoisted(() => vi.fn())
const logErrorMock = vi.hoisted(() => vi.fn())
vi.mock('electron-log', () => ({ default: { info: logInfoMock, error: logErrorMock } }))

import {
  createMcpService,
  DRAIN_HARD_CAP_MS,
  TOKEN_HASH_KEY,
  TOKEN_ISSUED_AT_KEY,
  type CreateMcpServiceDeps,
  type ListenerConnection,
  type ListenerPort,
  type ListenerState,
  type McpSettingsPort
} from './mcpService'

// Tests exercise mcpService against a FAKE ListenerPort — no real socket in
// this unit (mission scope, PR9). PR10's real `pipeListener.ts` satisfies
// the same `ListenerPort` shape without mcpService changing.

class FakeSocket extends Duplex {
  constructor() {
    super()
    // Real sockets emit 'error' around destroy()/end() races; nothing here
    // dials a real peer, so an unhandled 'error' would only crash the test
    // for a reason unrelated to what it verifies.
    this.on('error', () => {})
  }

  override _read(): void {
    // Nothing pushes data in these tests; mcpService never reads from the
    // socket itself (that is the SDK transport's job once connected).
  }

  override _write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    callback()
  }
}

function createFakeSocket(): FakeSocket {
  return new FakeSocket()
}

function createFakeSettings(): McpSettingsPort & { store: Record<string, string | null> } {
  const store: Record<string, string | null> = {}
  return {
    store,
    get: vi.fn((key: string) => store[key] ?? null),
    set: vi.fn((key: string, value: string | null) => {
      store[key] = value
    })
  }
}

function createFakePermissions(): McpPermissionRepository {
  return {
    getMatrix: vi.fn(() => ({})),
    setPermission: vi.fn(() => ({ canRead: false, canWrite: false })),
    hasAnyGrant: vi.fn(() => false)
  }
}

function createFakeAudit(): McpAuditRepository & {
  insert: ReturnType<typeof vi.fn<(input: McpAuditEntryInput) => void>>
} {
  return { insert: vi.fn<(input: McpAuditEntryInput) => void>() }
}

interface FakeListener extends ListenerPort {
  handler?: (connection: ListenerConnection) => void
}

function createFakeListener(): FakeListener {
  let currentState: ListenerState = 'stopped'
  let handler: ((connection: ListenerConnection) => void) | undefined
  return {
    listen: vi.fn((_endpoint: string, onConnection: (connection: ListenerConnection) => void) => {
      handler = onConnection
      currentState = 'listening'
    }),
    close: vi.fn(() => {
      currentState = 'stopped'
    }),
    get state() {
      return currentState
    },
    get handler() {
      return handler
    }
  }
}

const NO_DESCRIPTORS: ToolDescriptor<z.ZodObject, unknown>[] = []

function buildService(overrides: Partial<CreateMcpServiceDeps> = {}) {
  const settings = createFakeSettings()
  const permissions = createFakePermissions()
  const audit = createFakeAudit()
  const listener = createFakeListener()
  const connectSocket = vi.fn()
  const service = createMcpService({
    settings,
    permissions,
    audit,
    listener,
    descriptors: NO_DESCRIPTORS,
    endpoint: 'fake-endpoint',
    connectSocket,
    ...overrides
  })
  return { service, settings, permissions, audit, listener, connectSocket }
}

/** Seeds a token + grant and reconciles, so the fake listener is "listening" with a captured `onConnection` handler. */
function authenticatedSetup(overrides: Partial<CreateMcpServiceDeps> = {}) {
  const built = buildService(overrides)
  const token = generateToken()
  const hash = hashToken(token)
  built.settings.set(TOKEN_HASH_KEY, hash)
  vi.mocked(built.permissions.hasAnyGrant).mockReturnValue(true)
  built.service.reconcileListener()
  return { ...built, token, hash }
}

beforeEach(() => {
  logInfoMock.mockClear()
  logErrorMock.mockClear()
})

// --- Task 9.1: listener reconcile ------------------------------------------

describe('reconcileListener (task 9.1)', () => {
  it('does not listen with neither a token nor a grant', () => {
    const { service, listener } = buildService()
    service.reconcileListener()
    expect(listener.listen).not.toHaveBeenCalled()
  })

  it('does not listen with a token but no grant', () => {
    const { service, listener, settings } = buildService()
    settings.set(TOKEN_HASH_KEY, 'some-hash')
    service.reconcileListener()
    expect(listener.listen).not.toHaveBeenCalled()
  })

  it('does not listen with a grant but no token', () => {
    const { service, listener, permissions } = buildService()
    vi.mocked(permissions.hasAnyGrant).mockReturnValue(true)
    service.reconcileListener()
    expect(listener.listen).not.toHaveBeenCalled()
  })

  it('listens once both a token and a grant exist', () => {
    const { service, listener, settings, permissions } = buildService()
    settings.set(TOKEN_HASH_KEY, 'some-hash')
    vi.mocked(permissions.hasAnyGrant).mockReturnValue(true)
    service.reconcileListener()
    expect(listener.listen).toHaveBeenCalledTimes(1)
    expect(listener.listen).toHaveBeenCalledWith('fake-endpoint', expect.any(Function))
  })

  it('is idempotent: an unchanged eligible state never re-listens', () => {
    const { service, listener, settings, permissions } = buildService()
    settings.set(TOKEN_HASH_KEY, 'some-hash')
    vi.mocked(permissions.hasAnyGrant).mockReturnValue(true)
    service.reconcileListener()
    service.reconcileListener()
    expect(listener.listen).toHaveBeenCalledTimes(1)
  })

  it('stops listening once the grant disappears (the other half of "iff")', () => {
    const { service, listener, settings, permissions } = buildService()
    settings.set(TOKEN_HASH_KEY, 'some-hash')
    vi.mocked(permissions.hasAnyGrant).mockReturnValue(true)
    service.reconcileListener()
    expect(listener.state).toBe('listening')

    vi.mocked(permissions.hasAnyGrant).mockReturnValue(false)
    service.reconcileListener()
    expect(listener.close).toHaveBeenCalledTimes(1)
    expect(listener.state).toBe('stopped')
  })
})

// --- Task 9.4: handshake ----------------------------------------------------

describe('handshake (task 9.4)', () => {
  it('rejects a missing token: ack {ok:false}, socket destroyed, audit auth-failed', () => {
    const { listener, audit, connectSocket, hash } = authenticatedSetup()
    const socket = createFakeSocket()
    const writeSpy = vi.spyOn(socket, 'write')
    const destroySpy = vi.spyOn(socket, 'destroy')

    listener.handler!({ socket, hello: { present: false, hash: '' } })

    expect(writeSpy).toHaveBeenCalledWith(encodeAck(false, 'unauthorized'))
    expect(destroySpy).toHaveBeenCalledTimes(1)
    expect(audit.insert).toHaveBeenCalledTimes(1)
    expect(audit.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'auth-failed',
        tool: null,
        slice: null,
        action: null,
        summary: 'handshake rejected: missing token'
      })
    )
    expect(connectSocket).not.toHaveBeenCalled()
    // Sanity: the real hash used by this setup is never touched by a
    // present:false attempt — no cross-test bleed into the assertions above.
    expect(hash).toHaveLength(64)
  })

  it('rejects a wrong token: ack {ok:false}, socket destroyed, audit auth-failed with a distinct reason', () => {
    const { listener, audit, connectSocket } = authenticatedSetup()
    const socket = createFakeSocket()
    const writeSpy = vi.spyOn(socket, 'write')
    const destroySpy = vi.spyOn(socket, 'destroy')

    const wrongHash = hashToken(generateToken())
    listener.handler!({ socket, hello: { present: true, hash: wrongHash } })

    expect(writeSpy).toHaveBeenCalledWith(encodeAck(false, 'unauthorized'))
    expect(destroySpy).toHaveBeenCalledTimes(1)
    expect(audit.insert).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'auth-failed', summary: 'handshake rejected: token mismatch' })
    )
    expect(connectSocket).not.toHaveBeenCalled()
  })

  it('accepts a matching token: ack {ok:true}, connects the transport, audits nothing', () => {
    const { listener, audit, connectSocket, hash } = authenticatedSetup()
    const socket = createFakeSocket()
    const writeSpy = vi.spyOn(socket, 'write')
    const destroySpy = vi.spyOn(socket, 'destroy')

    listener.handler!({ socket, hello: { present: true, hash } })

    expect(writeSpy).toHaveBeenCalledWith(encodeAck(true))
    expect(destroySpy).not.toHaveBeenCalled()
    expect(connectSocket).toHaveBeenCalledTimes(1)
    expect(audit.insert).not.toHaveBeenCalled()
  })

  it('never reads the real token value into any audit row or electron-log line (threat-matrix)', () => {
    const { listener, audit } = authenticatedSetup()
    const realToken = generateToken()
    const realHash = hashToken(realToken)

    // Two failed attempts (missing, then a DIFFERENT wrong token) plus one
    // successful attempt with the real, correctly-hashed token — the widest
    // spread of outcomes this handshake path can produce.
    listener.handler!({ socket: createFakeSocket(), hello: { present: false, hash: '' } })
    listener.handler!({ socket: createFakeSocket(), hello: { present: true, hash: hashToken('cc_wrong-guess') } })

    const observed = JSON.stringify([...audit.insert.mock.calls, ...logInfoMock.mock.calls, ...logErrorMock.mock.calls])

    expect(observed).not.toContain(realToken)
    expect(observed).not.toContain(realHash)
    expect(observed).not.toContain('cc_wrong-guess')
  })
})

// --- Task 9.2: rotate drain --------------------------------------------------

describe('rotate drain (task 9.2)', () => {
  function setupAuthenticatedConnection(overrides: Partial<CreateMcpServiceDeps> = {}) {
    const connectionState = createConnectionState()
    const buildConnectionServer = vi.fn(() => ({ server: {} as McpServer, connection: connectionState }))
    const built = authenticatedSetup({ buildConnectionServer, ...overrides })
    const socket = createFakeSocket()
    const endSpy = vi.spyOn(socket, 'end')
    const destroySpy = vi.spyOn(socket, 'destroy')
    built.listener.handler!({ socket, hello: { present: true, hash: built.hash } })
    return { ...built, connectionState, socket, endSpy, destroySpy }
  }

  it('marks the existing connection stale immediately', () => {
    const { service, connectionState } = setupAuthenticatedConnection()
    service.issueToken()
    expect(connectionState.stale).toBe(true)
  })

  it('ends a connection with no in-flight calls right away', () => {
    const { service, endSpy, destroySpy } = setupAuthenticatedConnection()
    service.issueToken()
    expect(endSpy).toHaveBeenCalledTimes(1)
    expect(destroySpy).not.toHaveBeenCalled()
  })

  it('lets an in-flight call finish and return before ending the connection (threat-matrix)', () => {
    const { service, connectionState, endSpy } = setupAuthenticatedConnection()
    connectionState.inFlightCount = 1

    service.issueToken()
    expect(endSpy).not.toHaveBeenCalled()

    // PR3's tool wrapper decrements the counter then calls `settle()` in its
    // `finally` block on every completion — this simulates exactly that.
    connectionState.inFlightCount = 0
    connectionState.settle()
    expect(endSpy).toHaveBeenCalledTimes(1)
  })

  it('destroys a connection that never drains within the 10s hard cap', () => {
    let fireTimeout: () => void = () => {}
    const scheduleTimeout = vi.fn((callback: () => void) => {
      fireTimeout = callback
      return 0 as unknown as ReturnType<typeof setTimeout>
    })
    const clearScheduledTimeout = vi.fn()
    const { service, connectionState, endSpy, destroySpy } = setupAuthenticatedConnection({
      scheduleTimeout,
      clearScheduledTimeout
    })

    connectionState.inFlightCount = 1
    service.issueToken()
    expect(scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), DRAIN_HARD_CAP_MS)

    fireTimeout()
    expect(destroySpy).toHaveBeenCalledTimes(1)
    expect(endSpy).not.toHaveBeenCalled()

    // Draining after the hard cap already fired must be a no-op.
    connectionState.inFlightCount = 0
    connectionState.settle()
    expect(endSpy).not.toHaveBeenCalled()
  })

  it('keeps the listener listening after a rotate (only revoke closes it)', () => {
    const { service, listener } = setupAuthenticatedConnection()
    service.issueToken()
    expect(listener.close).not.toHaveBeenCalled()
    expect(listener.state).toBe('listening')
  })

  it('rejects a new connection presenting the OLD token hash after rotate (spec: "Rotate invalidates the old token")', () => {
    const { service, listener, audit, hash: oldHash } = setupAuthenticatedConnection()
    service.issueToken()

    const socket = createFakeSocket()
    const destroySpy = vi.spyOn(socket, 'destroy')
    listener.handler!({ socket, hello: { present: true, hash: oldHash } })

    expect(destroySpy).toHaveBeenCalledTimes(1)
    expect(audit.insert).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'auth-failed' }))
  })
})

// --- Task 9.3: revoke drain --------------------------------------------------

describe('revoke drain (task 9.3)', () => {
  it('stops the listener immediately', () => {
    const { service, listener } = authenticatedSetup()
    service.revokeToken()
    expect(listener.close).toHaveBeenCalledTimes(1)
    expect(listener.state).toBe('stopped')
  })

  it('closes an already-open, already-authenticated connection — not merely refuses new ones', () => {
    const connectionState = createConnectionState()
    const buildConnectionServer = vi.fn(() => ({ server: {} as McpServer, connection: connectionState }))
    const { service, listener, hash } = authenticatedSetup({ buildConnectionServer })
    const socket = createFakeSocket()
    const endSpy = vi.spyOn(socket, 'end')
    listener.handler!({ socket, hello: { present: true, hash } })

    service.revokeToken()

    // This is the exact failure mode the spec was expanded to cover: a naive
    // implementation that only stops the LISTENER (already proven above)
    // would pass that assertion while leaving this open connection able to
    // keep executing calls. Proving the tracked connection was marked stale
    // AND its socket actively ended is what rules that out.
    expect(connectionState.stale).toBe(true)
    expect(endSpy).toHaveBeenCalledTimes(1)
  })

  it('waits for an in-flight call to settle before closing (same drain mechanism as rotate)', () => {
    const connectionState = createConnectionState()
    const buildConnectionServer = vi.fn(() => ({ server: {} as McpServer, connection: connectionState }))
    const { service, listener, hash } = authenticatedSetup({ buildConnectionServer })
    const socket = createFakeSocket()
    const endSpy = vi.spyOn(socket, 'end')
    listener.handler!({ socket, hello: { present: true, hash } })

    connectionState.inFlightCount = 1
    service.revokeToken()
    expect(endSpy).not.toHaveBeenCalled()

    connectionState.inFlightCount = 0
    connectionState.settle()
    expect(endSpy).toHaveBeenCalledTimes(1)
  })
})

// --- Task 9.5: audit dispatch mirrors to electron-log -----------------------

describe('audit dispatch (task 9.5)', () => {
  it('mirrors every persisted audit row to electron-log', () => {
    const { listener } = authenticatedSetup()
    listener.handler!({ socket: createFakeSocket(), hello: { present: false, hash: '' } })

    expect(logInfoMock).toHaveBeenCalledWith(expect.stringContaining('auth-failed'))
  })
})

// --- Task 9.5: token lifecycle persistence ----------------------------------

describe('token lifecycle persistence (task 9.5)', () => {
  it('persists both the hash and the issued-at timestamp on issueToken, echoing the same issuedAt back', () => {
    const { service, settings } = buildService()
    const { issuedAt } = service.issueToken()

    expect(settings.store[TOKEN_HASH_KEY]).toEqual(expect.any(String))
    expect(settings.store[TOKEN_HASH_KEY]).toHaveLength(64)
    expect(settings.store[TOKEN_ISSUED_AT_KEY]).toBe(issuedAt)
  })

  it('clears both settings keys on revoke', () => {
    const { service, settings } = buildService()
    service.issueToken()
    expect(settings.store[TOKEN_HASH_KEY]).not.toBeNull()

    service.revokeToken()
    expect(settings.store[TOKEN_HASH_KEY]).toBeNull()
    expect(settings.store[TOKEN_ISSUED_AT_KEY]).toBeNull()
  })
})
