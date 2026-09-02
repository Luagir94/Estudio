// Handshake-flood resistance curve (design D10, threat-matrix "Handshake
// flood from any local process"). The listener applies `delayFor` before
// closing a socket that failed its handshake, and refuses any connection
// beyond `MAX_PENDING_HANDSHAKES` outright, without an audit row — both
// are pure values; the listener (`pipeListener.ts`, PR10) owns the
// mutable per-connection failure counters this curve is fed from.

/** At most this many handshakes may be pending (not yet acked) at once. */
export const MAX_PENDING_HANDSHAKES = 4

const BACKOFF_CAP_SECONDS = 8

/**
 * Backoff delay, in seconds, before the ack for a rejected handshake is
 * sent and the socket closed: `min(2^consecutiveFailures, 8)`. Resets to 0
 * on the first success — that reset is the caller's responsibility; this
 * function holds no state of its own.
 */
export function delayFor(consecutiveFailures: number): number {
  return Math.min(2 ** consecutiveFailures, BACKOFF_CAP_SECONDS)
}
