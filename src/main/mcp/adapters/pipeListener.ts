import net, { type Server, type Socket } from 'node:net'
import { delayFor, MAX_PENDING_HANDSHAKES } from '../domain/handshakeBackoff'
import { MAX_PREAMBLE_BYTES, parseHello } from '../../../shared/mcp/handshake'
import type { ListenerConnection, ListenerPort, ListenerState } from '../mcpService'

// The ONLY `node:net` import allowed under `src/main/` besides its own
// colocated test (design D4, `listener-only-in-mcp-slice` guard rule added
// in this same PR): a real listener on the internal leg (design D1 — a
// Windows named pipe, or a Unix socket off-Windows; `resolveEndpoint`,
// `src/shared/mcp/endpoint.ts`, decides which). This module owns exactly
// three things design's module layout assigns to it: the raw preamble read
// (byte cap + timeout, threat-matrix), handshake-flood backoff + pending cap
// (design D10), and surfacing `EADDRINUSE` as listener state `error` rather
// than letting it crash `bootstrap()`. It does NOT parse the hello line's
// token against the current hash, does NOT write an ack, and does NOT
// audit anything — those are `mcpService.ts`'s job (PR9, already committed,
// unmodified by this PR): the connection this module hands to `onConnection`
// carries only `{ socket, hello }`, `hello` already reduced to PR1's
// `parseHello` result `{ present, hash }` so the raw token string never
// exists on this side of the wire boundary at all.

/** How long a raw connection may take to send its newline-terminated hello line before it is treated as a failed handshake. */
export const PREAMBLE_TIMEOUT_MS = 5_000

export type TimeoutHandle = ReturnType<typeof setTimeout>

export interface CreatePipeListenerDeps {
  scheduleTimeout?: (callback: () => void, ms: number) => TimeoutHandle
  clearScheduledTimeout?: (handle: TimeoutHandle) => void
}

/**
 * Builds a `ListenerPort` (the seam `mcpService.ts`, PR9, already declares
 * and consumes) backed by a real `node:net` server. Every accepted raw
 * socket goes through the SAME failure path — oversize preamble (> 4 KiB),
 * no newline within `PREAMBLE_TIMEOUT_MS`, or the peer closing before either
 * — so design D10's backoff applies uniformly to any failed handshake
 * attempt, not just one specific cause of failure.
 */
export function createPipeListener(deps: CreatePipeListenerDeps = {}): ListenerPort {
  const scheduleTimeout = deps.scheduleTimeout ?? ((callback: () => void, ms: number) => setTimeout(callback, ms))
  const clearScheduledTimeout = deps.clearScheduledTimeout ?? ((handle: TimeoutHandle) => clearTimeout(handle))

  let state: ListenerState = 'stopped'
  let listenerError: string | null = null
  let server: Server | null = null
  let pendingHandshakes = 0
  let consecutiveFailures = 0

  function handleConnection(socket: Socket, onConnection: (connection: ListenerConnection) => void): void {
    // Real sockets can emit 'error' around a destroy/refuse race; every
    // failure path below is reached through the listeners set up here, never
    // a throw, so an unhandled 'error' event must never crash the process.
    socket.on('error', () => {})

    if (pendingHandshakes >= MAX_PENDING_HANDSHAKES) {
      // Refused outright: NOT counted as a failure (no backoff scheduled)
      // and NEVER reaches `onConnection` — no audit row can exist for a
      // connection mcpService never saw. That is deliberate (design D10):
      // auditing refused floods is what would let an attacker evict genuine
      // audit history, which is why auth-failed rows got their own capped
      // retention in the first place.
      socket.destroy()
      return
    }
    pendingHandshakes += 1

    let buffer = ''
    let settled = false

    const cleanup = (): void => {
      clearScheduledTimeout(timer)
      socket.removeListener('data', onData)
      socket.removeListener('close', onClose)
      pendingHandshakes -= 1
    }

    // A failed handshake attempt: oversize preamble, no newline within the
    // window, or the peer closing before either. Backoff (design D10)
    // delays the actual `destroy()` — `min(2^consecutiveFailures, 8)` s,
    // escalating — rather than closing the socket immediately, so a script
    // hammering fast reconnect attempts is throttled.
    const fail = (): void => {
      if (settled) return
      settled = true
      cleanup()
      const delayMs = delayFor(consecutiveFailures) * 1000
      consecutiveFailures += 1
      scheduleTimeout(() => socket.destroy(), delayMs)
    }

    const succeed = (line: string): void => {
      if (settled) return
      settled = true
      cleanup()
      consecutiveFailures = 0
      onConnection({ socket, hello: parseHello(line) })
    }

    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8')
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex !== -1) {
        succeed(buffer.slice(0, newlineIndex))
        return
      }
      if (Buffer.byteLength(buffer, 'utf8') > MAX_PREAMBLE_BYTES) {
        fail()
      }
    }

    const onClose = (): void => {
      fail()
    }

    socket.on('data', onData)
    socket.on('close', onClose)
    const timer = scheduleTimeout(fail, PREAMBLE_TIMEOUT_MS)
  }

  return {
    listen(endpoint, onConnection) {
      listenerError = null
      const srv = net.createServer((socket) => handleConnection(socket, onConnection))
      // EADDRINUSE (a second app instance, or a stale pipe from an earlier
      // crash) must surface as listener state `error`, never throw or crash
      // `bootstrap()` (threat-matrix). The message itself is surfaced
      // verbatim through `error` (task 14.3) so `mcp:status.listenerError`
      // can tell the user WHY, not just that something failed.
      srv.on('error', (err) => {
        state = 'error'
        listenerError = err.message
      })
      srv.listen(endpoint, () => {
        state = 'listening'
      })
      server = srv
    },
    close() {
      server?.close()
      server = null
      state = 'stopped'
      listenerError = null
    },
    get state() {
      return state
    },
    get error() {
      return listenerError
    }
  }
}
