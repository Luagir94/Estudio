import type { Duplex, Readable, Writable } from 'node:stream'
import { encodeHello, parseAck } from '../shared/mcp/handshake'

// The shim's core relay logic (design "Data Flow" / D1, threat-matrix cases
// "Client sends JSON-RPC before ack" and "App exits mid-session"). Never
// references `process` — every I/O primitive arrives injected, which is
// what lets this module be driven by `PassThrough`/fake-duplex doubles in
// `relay.test.ts` instead of a real named pipe and real process streams.
// `index.ts` is the only file that supplies the real ones (design "Module
// Layout").
//
// Sequence: connect -> write the hello line -> wait for the ack line ->
// only THEN start the byte-exact stdin<->socket relay. `stdin.pipe(socket)`
// is never called before the ack succeeds, so Node's own internal stream
// buffer holds anything the client already wrote, in order, with nothing
// lost or interleaved with the hello line this module writes itself
// ("hello written before stdin relayed" — a client may send JSON-RPC
// before the ack arrives).

/** Env var the app-side client config sets (design D2's `env: { COURSE_COMPANION_MCP_TOKEN }`). */
export const MCP_TOKEN_ENV_VAR = 'COURSE_COMPANION_MCP_TOKEN'

/** How long the shim waits for the app's ack line before giving up on an otherwise-open connection. */
export const ACK_TIMEOUT_MS = 5_000

// Exact stderr wording design D6 assigns to each failure — the shim's ONLY
// user-facing surface on failure (spec "Shim stdout carries only MCP
// messages": stdout must never carry a diagnostic).
export const NOT_RUNNING_MESSAGE =
  'Course Companion is not running, or MCP is not enabled in Ajustes (no token issued or no slice granted).'
export const TOKEN_REJECTED_MESSAGE = 'Token rejected; issue a new one in Ajustes'
export const CONNECTION_CLOSED_MESSAGE = 'Connection closed by Course Companion'
/** Not literal design wording (D6 covers ENOENT/refusal/mid-session close, not a silent peer) — a connected-but-unresponsive app is a distinct failure this module must still fail closed on. */
export const ACK_TIMEOUT_MESSAGE = 'Timed out waiting for Course Companion to respond to the handshake'

export interface RunRelayOptions {
  stdin: Readable
  stdout: Writable
  stderr: Writable
  /**
   * Opens the internal-leg connection — real `node:net` `connect()` in
   * `index.ts`, a fake duplex in tests. May throw synchronously OR the
   * returned duplex may later emit `'error'`; both are treated as
   * "app not running" while no handshake has completed yet (design D1: an
   * `ENOENT`/`ECONNREFUSED` connect failure is the unambiguous
   * app-not-running signal).
   */
  connect: () => Duplex
  env: Readonly<Record<string, string | undefined>>
  exit: (code: number) => void
}

/**
 * Runs one shim session end to end: connect, hand shake, then relay bytes
 * until stdin ends (exit 0) or something fails (exit 1, one stderr line).
 * A mid-session close is terminal by design (D6) — this function never
 * reconnects or queues a call made while disconnected.
 */
export function runRelay(options: RunRelayOptions): void {
  const { stdin, stdout, stderr, connect, env, exit } = options

  let socket: Duplex
  try {
    socket = connect()
  } catch {
    stderr.write(`${NOT_RUNNING_MESSAGE}\n`)
    exit(1)
    return
  }

  let settled = false
  let handshakeComplete = false

  const ackTimer = setTimeout(() => finish(1, ACK_TIMEOUT_MESSAGE), ACK_TIMEOUT_MS)

  function finish(code: number, message?: string): void {
    if (settled) return
    settled = true
    clearTimeout(ackTimer)
    if (message !== undefined) stderr.write(`${message}\n`)
    socket.destroy()
    exit(code)
  }

  // Fires on either a connect-time failure (before any handshake) or a
  // mid-session disruption (after one) — the message differs by which,
  // never the handling: both paths fail closed, exactly once.
  socket.on('error', () => finish(1, handshakeComplete ? CONNECTION_CLOSED_MESSAGE : NOT_RUNNING_MESSAGE))
  socket.on('close', () => finish(1, handshakeComplete ? CONNECTION_CLOSED_MESSAGE : NOT_RUNNING_MESSAGE))

  let ackBuffer = ''
  const onAckChunk = (chunk: Buffer | string): void => {
    ackBuffer += chunk.toString()
    const newlineIndex = ackBuffer.indexOf('\n')
    if (newlineIndex === -1) return
    socket.removeListener('data', onAckChunk)

    const ackLine = ackBuffer.slice(0, newlineIndex)
    const leftover = ackBuffer.slice(newlineIndex + 1)
    const ack = parseAck(ackLine)
    if (!ack.ok) {
      finish(1, TOKEN_REJECTED_MESSAGE)
      return
    }

    handshakeComplete = true
    clearTimeout(ackTimer)
    // Any bytes the same chunk carried past the ack's newline are already
    // real relay traffic, not part of the ack — forward them before the
    // pipe takes over so nothing between the ack and the first `pipe()`
    // read is lost.
    if (leftover.length > 0) stdout.write(leftover)
    socket.pipe(stdout)
    stdin.pipe(socket)
    stdin.on('end', () => finish(0))
  }
  socket.on('data', onAckChunk)

  socket.write(encodeHello(env[MCP_TOKEN_ENV_VAR] ?? ''))
}
