import { Duplex } from 'node:stream'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import log from 'electron-log'
import type { z } from 'zod'
import { encodeAck, type ParsedHello } from '../../shared/mcp/handshake'
import type { McpAuditEntryInput, McpAuditRepository } from './adapters/sqliteMcpAuditRepository'
import type { McpPermissionRepository } from './adapters/sqliteMcpPermissionRepository'
import {
  createConnectionMcpServer,
  type McpAuditRecord,
  type McpConnectionState,
  type McpServerFactoryDeps
} from './adapters/mcpServerFactory'
import { authFailedSummary } from './domain/auditEntry'
import { isAllowed, type McpAction, type McpSlice } from './domain/permissions'
import {
  generateToken as defaultGenerateToken,
  hashToken as defaultHashToken,
  tokensMatch as defaultTokensMatch
} from './domain/token'
import type { ToolDescriptor } from './domain/toolDescriptor'

// The MCP inbound server's orchestration core (design D7-D10, spec
// mcp-auth-token / mcp-slice-permissions / mcp-activity-audit). Everything
// this module touches that PR3 (`mcpServerFactory.ts`) or PR1/PR2 already
// built is composed here, never reimplemented: `createConnectionMcpServer`
// per accepted connection, `tokensMatch`'s timing-safe compare, the
// permission matrix's default-deny `isAllowed`, and the two repositories'
// own transactional/atomic guarantees.
//
// This unit owns exactly four things design D8-D10 assign to it: (1) the
// listener reconcile decision (token + grant, both required), (2) the
// rotate/revoke connection drain (in-flight settle, `end()`, 10s hard-cap
// `destroy()`), (3) the handshake decision + ack + auth-failed audit, and
// (4) dispatching every audit record — tool-driven or handshake-driven — to
// both the repository and electron-log. It never opens a real socket
// itself: `ListenerPort` is the seam PR10's `pipeListener.ts` (node:net)
// satisfies; this unit's own tests satisfy it with a fake.

export type ListenerState = 'stopped' | 'listening' | 'error'

/**
 * One accepted connection, already past the raw preamble read (PR10's job:
 * 4 KiB / 5 s cap, backoff, pending-handshake throttling — none of that is
 * this unit's concern). `hello` is PR1's `parseHello` result — `{ present,
 * hash }` ONLY. The raw token string never exists on this side of the wire
 * boundary at all (threat-matrix "Token in pipe name / argv / log"): there
 * is no field here it could even be read into. `socket` is the live duplex
 * the SDK's `StdioServerTransport(socket, socket)` is handed on success
 * (PR3 Spike A proved an arbitrary duplex pair works); this unit's tests
 * hand in a `Duplex` stub instead of a real socket.
 */
export interface ListenerConnection {
  socket: Duplex
  hello: ParsedHello
}

/**
 * The seam PR10's real `pipeListener.ts` implements against a real
 * `node:net` server. Declared here, not there, because the consumer owns
 * the port it depends on — PR10 satisfies this shape without mcpService
 * changing (mission requirement). This unit's tests implement a fake.
 */
export interface ListenerPort {
  listen(endpoint: string, onConnection: (connection: ListenerConnection) => void): void
  close(): void
  readonly state: ListenerState
}

/** The `get`/`set` slice of `AppSettingsRepository` this service needs — same narrow shape as `themeService.ts`'s `ThemeSettingsPort`. */
export interface McpSettingsPort {
  get(key: string): string | null
  set(key: string, value: string | null): void
}

/** `app_settings` keys (design D7). */
export const TOKEN_HASH_KEY = 'mcp.tokenHash'
export const TOKEN_ISSUED_AT_KEY = 'mcp.tokenIssuedAt'

export type TimeoutHandle = ReturnType<typeof setTimeout>

/** A connection that never drains is force-closed after this long (design D8). */
export const DRAIN_HARD_CAP_MS = 10_000

export interface McpService {
  /**
   * Starts or stops the listener so it is running iff a token exists AND at
   * least one slice is granted (spec "Listener lifecycle is gated by token
   * and grant state" — both directions: it must neither run with only one
   * of the two, nor stay running once that stops holding). Idempotent:
   * calling it repeatedly with an unchanged condition never re-`listen`s or
   * re-`close`s.
   */
  reconcileListener(): void
  /**
   * Issues a fresh token — the very first one, or a rotation, is the same
   * operation (design D7/D8). Persists its hash and issued-at timestamp,
   * drains every existing connection (design D8: an in-flight call still
   * completes and returns before its connection is ended; any NEW call on
   * that connection after this point is rejected), then reconciles the
   * listener (starts it on a true first issue; a no-op on rotate, since the
   * listener already satisfies the reconcile condition). Returns the
   * PLAINTEXT token — shown to the user exactly once (design D7); this
   * service never persists it.
   */
  issueToken(): { token: string; issuedAt: string }
  /**
   * Clears the token, closes the listener IMMEDIATELY (not merely once
   * connections drain), and drains every already-open connection — closing
   * them, not just refusing new ones (spec "Revocation terminates
   * already-open connections, not just the listener": the failure mode this
   * exists to rule out is a revoked token that keeps working on a session
   * opened before the revocation).
   */
  revokeToken(): { revoked: true }
}

interface TrackedConnection {
  socket: Duplex
  state: McpConnectionState
}

export interface CreateMcpServiceDeps {
  settings: McpSettingsPort
  permissions: McpPermissionRepository
  audit: McpAuditRepository
  /** Injected so PR10's real pipe listener can satisfy this without mcpService changing. */
  listener: ListenerPort
  /** The 32-tool catalog (PR5-8), assembled by the caller (PR11's `bootstrap()`) — mcpService owns none of it, only composes it per connection via PR3's factory. */
  descriptors: ToolDescriptor<z.ZodObject, unknown>[]
  endpoint: string
  now?: () => string
  generateToken?: () => string
  hashToken?: (token: string) => string
  tokensMatch?: (hashA: string, hashB: string) => boolean
  /**
   * PR3's per-connection factory, injected so this unit's tests can hand
   * back a `McpConnectionState` they control directly (`inFlightCount`,
   * `stale`, `settle`) instead of driving a real call through a live SDK
   * transport just to exercise the drain. Defaults to the real
   * `createConnectionMcpServer`.
   */
  buildConnectionServer?: (
    descriptors: ToolDescriptor<z.ZodObject, unknown>[],
    deps: McpServerFactoryDeps
  ) => { server: McpServer; connection: McpConnectionState }
  /**
   * SDK wiring for a successfully authenticated connection — default is the
   * real `StdioServerTransport(socket, socket)` + `server.connect()` (PR3
   * Spike A). Overridden with a no-op fake in this unit's tests: no real
   * transport round trip is exercised here, only this service's own
   * orchestration (PR10/e2e cover the live wire).
   */
  connectSocket?: (server: McpServer, socket: Duplex) => void | Promise<void>
  drainTimeoutMs?: number
  scheduleTimeout?: (callback: () => void, ms: number) => TimeoutHandle
  clearScheduledTimeout?: (handle: TimeoutHandle) => void
}

async function defaultConnectSocket(server: McpServer, socket: Duplex): Promise<void> {
  const transport = new StdioServerTransport(socket, socket)
  await server.connect(transport)
}

export function createMcpService({
  settings,
  permissions,
  audit,
  listener,
  descriptors,
  endpoint,
  now = () => new Date().toISOString(),
  generateToken = defaultGenerateToken,
  hashToken = defaultHashToken,
  tokensMatch = defaultTokensMatch,
  buildConnectionServer = createConnectionMcpServer,
  connectSocket = defaultConnectSocket,
  drainTimeoutMs = DRAIN_HARD_CAP_MS,
  scheduleTimeout = (callback, ms) => setTimeout(callback, ms),
  clearScheduledTimeout = (handle) => clearTimeout(handle)
}: CreateMcpServiceDeps): McpService {
  const connections = new Set<TrackedConnection>()

  function getTokenHash(): string | null {
    return settings.get(TOKEN_HASH_KEY)
  }

  // Read fresh on every call, never cached: this is what makes a mid-session
  // grant withdrawal apply to the very next call on an already-open
  // connection, with no reconnect required (spec "Permission changes apply
  // on the next call, not only on reconnect").
  function authorize(slice: McpSlice, action: McpAction): boolean {
    return isAllowed(permissions.getMatrix(), slice, action)
  }

  /**
   * The single place every audit record — tool-driven or handshake-driven —
   * reaches both the repository and electron-log (spec "Every mutation is
   * audited" / "... and logged via electron-log"). Only ever fed fields
   * `domain/auditEntry.ts`'s builders already guarantee are identifier-only
   * or closed-enum text: never a raw payload, never a token, never a hash.
   */
  function dispatchAudit(input: McpAuditEntryInput): void {
    audit.insert(input)
    log.info(`mcp ${input.outcome}: ${input.tool ?? 'handshake'} ${input.summary}`)
  }

  function toolAudit(record: McpAuditRecord): void {
    dispatchAudit({
      occurredAt: now(),
      tool: record.tool,
      slice: record.slice,
      action: record.action,
      outcome: record.outcome,
      summary: record.summary,
      clientName: null,
      errorCode: null
    })
  }

  /**
   * Design D8's shared rotate/revoke drain: mark the connection stale (so
   * PR3's wrapper starts returning `SESSION_TERMINATED` for any NEW call on
   * it), then either end it right away (nothing in flight) or wait for the
   * in-flight counter to reach zero via the `settle` hook PR3's wrapper
   * already calls on every completion — with a hard cap so a call that
   * never returns cannot hold a connection open forever.
   */
  function drainConnection(tracked: TrackedConnection): void {
    tracked.state.stale = true

    if (tracked.state.inFlightCount === 0) {
      connections.delete(tracked)
      tracked.socket.end()
      return
    }

    let settled = false
    // `finish` closes over `timer`, but nothing can call it before the
    // `const timer = scheduleTimeout(...)` line below runs: both callers
    // are registered after that line, never invoked synchronously above it.
    const finish = (destroy: boolean): void => {
      if (settled) return
      settled = true
      clearScheduledTimeout(timer)
      connections.delete(tracked)
      if (destroy) {
        tracked.socket.destroy()
      } else {
        tracked.socket.end()
      }
    }

    tracked.state.settle = () => {
      if (tracked.state.inFlightCount === 0) finish(false)
    }

    const timer = scheduleTimeout(() => finish(true), drainTimeoutMs)
  }

  function drainAllConnections(): void {
    for (const tracked of [...connections]) {
      drainConnection(tracked)
    }
  }

  function onConnection(connection: ListenerConnection): void {
    const tokenHash = getTokenHash()
    const ok = connection.hello.present && tokenHash !== null && tokensMatch(connection.hello.hash, tokenHash)

    if (!ok) {
      connection.socket.write(encodeAck(false, 'unauthorized'))
      connection.socket.destroy()
      dispatchAudit({
        occurredAt: now(),
        tool: null,
        slice: null,
        action: null,
        outcome: 'auth-failed',
        summary: authFailedSummary(connection.hello.present ? 'token-mismatch' : 'missing-token'),
        clientName: null,
        errorCode: null
      })
      return
    }

    connection.socket.write(encodeAck(true))
    const { server, connection: state } = buildConnectionServer(descriptors, { authorize, audit: toolAudit })
    connections.add({ socket: connection.socket, state })
    // Fire-and-forget: registering the connection is synchronous, wiring the
    // SDK transport is not, and nothing here needs to block on it.
    void connectSocket(server, connection.socket)
  }

  function reconcileListener(): void {
    const shouldListen = getTokenHash() !== null && permissions.hasAnyGrant()
    if (shouldListen && listener.state !== 'listening') {
      listener.listen(endpoint, onConnection)
    } else if (!shouldListen && listener.state === 'listening') {
      listener.close()
    }
  }

  return {
    reconcileListener,
    issueToken() {
      const token = generateToken()
      const hash = hashToken(token)
      const issuedAt = now()
      settings.set(TOKEN_HASH_KEY, hash)
      settings.set(TOKEN_ISSUED_AT_KEY, issuedAt)
      drainAllConnections()
      reconcileListener()
      return { token, issuedAt }
    },
    revokeToken() {
      settings.set(TOKEN_HASH_KEY, null)
      settings.set(TOKEN_ISSUED_AT_KEY, null)
      listener.close()
      drainAllConnections()
      return { revoked: true }
    }
  }
}
