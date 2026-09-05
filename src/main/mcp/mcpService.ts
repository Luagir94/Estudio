import { Duplex } from 'node:stream'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import log from 'electron-log'
import type { z } from 'zod'
import { encodeAck, type ParsedHello } from '../../shared/mcp/handshake'
import type { McpAuditEntryInput, McpAuditRepository, StoredMcpAuditEntry } from './adapters/sqliteMcpAuditRepository'
import type { McpPermissionRepository } from './adapters/sqliteMcpPermissionRepository'
import {
  createConnectionMcpServer,
  type McpAuditRecord,
  type McpConnectionState,
  type McpServerFactoryDeps
} from './adapters/mcpServerFactory'
import { authFailedSummary } from './domain/auditEntry'
import { isAllowed, MCP_SLICES, type McpAction, type McpSlice } from './domain/permissions'
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
// This unit owns exactly five things design D8-D10 assign to it: (1) the
// listener reconcile decision (token + grant, both required), (2) the
// rotate/revoke connection drain (in-flight settle, `end()`, 10s hard-cap
// `destroy()`), (3) the handshake decision + ack + auth-failed audit, (4)
// dispatching every audit record — tool-driven or handshake-driven — to
// both the repository and electron-log, and (5) the app-quit drain
// (`shutdown()`, defect fix PR11b): the SAME drain as (2), reused rather
// than duplicated, on a shorter hard cap and without clearing the token. It
// never opens a real socket itself: `ListenerPort` is the seam PR10's
// `pipeListener.ts` (node:net) satisfies; this unit's own tests satisfy it
// with a fake.

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
  /** Non-null only when `state === 'error'` (task 14.3) — surfaced verbatim in `getStatus().listenerError`. */
  readonly error: string | null
}

/** The `get`/`set` slice of `AppSettingsRepository` this service needs — same narrow shape as `themeService.ts`'s `ThemeSettingsPort`. */
export interface McpSettingsPort {
  get(key: string): string | null
  set(key: string, value: string | null): void
}

/** `app_settings` keys (design D7). */
export const TOKEN_HASH_KEY = 'mcp.tokenHash'
export const TOKEN_ISSUED_AT_KEY = 'mcp.tokenIssuedAt'

/** One curated slice's grant, as `mcp:status`/`mcp:setPermission` (design "`mcp:*` IPC contract" table) shape it — structurally identical to `shared/ipc/mcp.ts`'s `McpPermission`, duplicated rather than imported for the same layering reason that module's own header documents (main never imports from `shared/ipc/*`'s inferred TYPES the other way around — `mcpService.ts` predates that contract and stays framework-free of it). */
export interface McpPermissionStatus {
  slice: McpSlice
  canRead: boolean
  canWrite: boolean
}

/** `mcp:status`'s full result (task 14.3) — everything `registerMcpHandlers.ts` needs, with no repository call of its own. */
export interface McpStatus {
  listener: ListenerState
  listenerError: string | null
  tokenIssuedAt: string | null
  shimPath: string
  endpoint: string
  /** One entry per curated slice (`domain/permissions.ts`'s `MCP_SLICES`), never only the granted ones — see `getStatus`'s doc comment below. */
  permissions: McpPermissionStatus[]
}

export type TimeoutHandle = ReturnType<typeof setTimeout>

/** A connection that never drains is force-closed after this long (design D8). */
export const DRAIN_HARD_CAP_MS = 10_000

/**
 * `shutdown()`'s own hard cap (defect fix, PR11b) — shorter than
 * `DRAIN_HARD_CAP_MS` on purpose: a token rotation can afford to wait ten
 * seconds for a stray in-flight call in the background, but an app the user
 * just asked to close should not hang around that long for one. Every tool
 * call in this catalog is a single sqlite statement (sub-millisecond), so
 * three seconds is generous headroom for a call that is genuinely still
 * running, while keeping quit-time latency something a closing app can
 * still call "prompt".
 */
export const QUIT_DRAIN_CAP_MS = 3_000

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
  /**
   * App-quit drain (defect fix, PR11b — reuses design D8's rotate/revoke
   * drain, never a second mechanism): stops the listener and drains every
   * open connection the same way `revokeToken()` does, but on
   * `QUIT_DRAIN_CAP_MS` instead of `DRAIN_HARD_CAP_MS`. Unlike
   * `revokeToken()`, this does NOT clear the persisted token or grants —
   * it is a connection drain, not a revocation, so the same token still
   * works on the app's next launch. The caller (`bootstrap()`'s
   * `will-quit` hook) MUST await the returned promise before letting the
   * process actually exit, or the drain's `end()`/`destroy()` calls race
   * process teardown and the client sees no prompt disconnect notification
   * at all — the exact defect this method exists to fix.
   */
  shutdown(): Promise<void>
  /**
   * `mcp:status` (task 14.3, design "`mcp:*` IPC contract" table). Reads the
   * listener port, the settings port and the permission repository — never
   * the plaintext token (design D7: it is never persisted anywhere this
   * could read it back), and never the token hash either.
   */
  getStatus(): McpStatus
  /**
   * `mcp:setPermission` (task 14.3). Persists the grant, then reconciles the
   * listener (spec "Listener lifecycle is gated by token and grant state") —
   * granting the FIRST slice while a token already exists is what starts the
   * listener for the very first time; withdrawing the LAST slice stops it,
   * the same reconcile `revokeToken`/`issueToken` already trigger.
   */
  setPermission(input: { slice: McpSlice; canRead: boolean; canWrite: boolean }): McpPermissionStatus
  /**
   * `mcp:listActivity` (task 14.3). A thin pass-through to the audit
   * repository's own newest-first ordering — this service adds no
   * projection or filtering of its own.
   */
  listActivity(limit?: number): StoredMcpAuditEntry[]
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
  /** Absolute path to the built stdio shim (design D2, `bootstrap()`'s `getMcpShimPath()`) — echoed verbatim by `getStatus()`, never resolved here. */
  shimPath: string
  /** Fans `MCP_ACTIVITY_CHANGED_CHANNEL` out to every window (task 14.4) — same injected-callback shape as `indexadoService.ts`'s `notifyStatusChanged`, so this module never imports Electron. Optional (default no-op) so PR9's original 29 tests, which predate this hook, keep passing unchanged. */
  notifyActivityChanged?: (id: number) => void
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
  shimPath,
  notifyActivityChanged = () => {},
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
    const { id } = audit.insert(input)
    log.info(`mcp ${input.outcome}: ${input.tool ?? 'handshake'} ${input.summary}`)
    notifyActivityChanged(id)
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
   * Design D8's shared rotate/revoke/shutdown drain: mark the connection
   * stale (so PR3's wrapper starts returning `SESSION_TERMINATED` for any
   * NEW call on it), then either end it right away (nothing in flight) or
   * wait for the in-flight counter to reach zero via the `settle` hook
   * PR3's wrapper already calls on every completion — with a hard cap so a
   * call that never returns cannot hold a connection open forever. Returns
   * a promise so `shutdown()` (defect fix, PR11b) can await every
   * connection's actual `end()`/`destroy()` before letting the process
   * exit; rotate/revoke fire this without awaiting, unchanged from before.
   * `timeoutMs` defaults to the shared rotate/revoke cap and is overridden
   * only by `shutdown()`'s shorter one.
   */
  function drainConnection(tracked: TrackedConnection, timeoutMs = drainTimeoutMs): Promise<void> {
    tracked.state.stale = true

    if (tracked.state.inFlightCount === 0) {
      connections.delete(tracked)
      tracked.socket.end()
      return Promise.resolve()
    }

    return new Promise((resolve) => {
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
        resolve()
      }

      tracked.state.settle = () => {
        if (tracked.state.inFlightCount === 0) finish(false)
      }

      const timer = scheduleTimeout(() => finish(true), timeoutMs)
    })
  }

  function drainAllConnections(timeoutMs = drainTimeoutMs): Promise<void> {
    return Promise.all([...connections].map((tracked) => drainConnection(tracked, timeoutMs))).then(() => undefined)
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
    const tracked: TrackedConnection = { socket: connection.socket, state }
    connections.add(tracked)
    // Fire-and-forget: registering the connection is synchronous, wiring the
    // SDK transport is not, and nothing here needs to block on it. It still
    // needs its OWN rejection handler, though — the connection is already in
    // `connections` by this point, so a bare `void` on a rejected
    // `server.connect()` (the socket dying between the ack and the transport
    // start) would both surface as an unhandled rejection in main AND leave a
    // dead entry in the tracked set until the next rotate/revoke drain got
    // around to ending it. `Promise.resolve` wraps it because `connectSocket`
    // is allowed to be synchronous (this unit's own tests inject a no-op).
    void Promise.resolve(connectSocket(server, connection.socket)).catch((error: unknown) => {
      log.error('mcp transport failed to start', error)
      connections.delete(tracked)
      connection.socket.destroy()
    })
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
      void drainAllConnections()
      reconcileListener()
      return { token, issuedAt }
    },
    revokeToken() {
      settings.set(TOKEN_HASH_KEY, null)
      settings.set(TOKEN_ISSUED_AT_KEY, null)
      listener.close()
      void drainAllConnections()
      return { revoked: true }
    },
    shutdown() {
      listener.close()
      return drainAllConnections(QUIT_DRAIN_CAP_MS)
    },
    getStatus() {
      const matrix = permissions.getMatrix()
      return {
        listener: listener.state,
        listenerError: listener.error,
        tokenIssuedAt: settings.get(TOKEN_ISSUED_AT_KEY),
        shimPath,
        endpoint,
        // Every curated slice, not only the ones with a row (design: "so a
        // permissions UI can render every toggle without a second round
        // trip") — an absent row still means canRead/canWrite false
        // (default-deny, same rule `isAllowed` already applies).
        permissions: MCP_SLICES.map((slice) => {
          const grant = matrix[slice]
          return { slice, canRead: grant?.canRead ?? false, canWrite: grant?.canWrite ?? false }
        })
      }
    },
    setPermission(input) {
      const grant = permissions.setPermission({ ...input, updatedAt: now() })
      reconcileListener()
      return { slice: input.slice, canRead: grant.canRead, canWrite: grant.canWrite }
    },
    listActivity(limit) {
      return audit.list(limit)
    }
  }
}
