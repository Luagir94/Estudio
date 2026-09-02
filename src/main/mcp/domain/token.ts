import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// MCP auth token domain primitives (design D7): a plaintext token is shown
// to the user exactly once at issue/rotate time; only its SHA-256 hash is
// ever persisted (`app_settings` keys `mcp.tokenHash`/`mcp.tokenIssuedAt`).
// Comparison happens on hashes, using `timingSafeEqual` so a byte-by-byte
// early exit cannot leak how much of a guessed token matched a stored one.

export const TOKEN_PREFIX = 'cc_'
const TOKEN_RANDOM_BYTES = 32

/**
 * Generates a new plaintext token: `cc_` followed by 32 cryptographically
 * random bytes, base64url-encoded (no padding). The caller is responsible
 * for showing it to the user exactly once — this function never persists
 * anything.
 */
export function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_RANDOM_BYTES).toString('base64url')}`
}

/** SHA-256 hex digest of a token — the only form ever persisted or compared. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Timing-safe comparison of two token hashes. Returns `false` (never
 * throws) when the hashes differ in length — `timingSafeEqual` requires
 * equal-length buffers, and a length mismatch already means "no match"
 * without needing a constant-time comparison against garbage.
 */
export function tokensMatch(hashA: string, hashB: string): boolean {
  const bufferA = Buffer.from(hashA, 'hex')
  const bufferB = Buffer.from(hashB, 'hex')
  if (bufferA.length !== bufferB.length) {
    return false
  }
  return timingSafeEqual(bufferA, bufferB)
}
