import { createHash } from 'node:crypto'
import { z } from 'zod'

// Wire codec for the hello/ack preamble exchanged over the internal leg
// (design "Data Flow" / D7). Framework-free and shared with the shim
// (bundled into it), same boundary rationale as `endpoint.ts`: no renderer
// ever loads this module, so it is free to use `node:crypto`. It does NOT
// depend on `src/main/mcp/domain/token.ts` — that module is main-only and
// this one must build standalone into the shim's single bundled file.
//
// `parseHello` NEVER returns the raw token it parses: the hello line is
// hashed immediately, and only `{ present, hash }` survives past this
// function — the token value is never read into any string that reaches
// audit or electron-log (spec "Token never appears in audit or log
// output"), and this is where that guarantee starts, at the wire boundary.

/** Preamble byte cap (threat-matrix: "Preamble > 4 KiB or no newline in 5s → socket destroyed"). */
export const MAX_PREAMBLE_BYTES = 4096

const helloMessageSchema = z.object({ token: z.string().min(1) })

export interface ParsedHello {
  present: boolean
  hash: string
}

/** Encodes the hello preamble line the shim sends: one newline-terminated JSON object carrying the plaintext token. */
export function encodeHello(token: string): string {
  return `${JSON.stringify({ token })}\n`
}

/**
 * Parses a hello preamble line. `present` is `false` for malformed JSON, a
 * missing `token` key, or an empty token — every one of those fails closed
 * as "no token", never throwing. `hash` is the SHA-256 hex digest of
 * whatever token WAS present, or `''` when none was.
 */
export function parseHello(line: string): ParsedHello {
  const parsed = helloMessageSchema.safeParse(safeJsonParse(line))
  if (!parsed.success) {
    return { present: false, hash: '' }
  }
  return { present: true, hash: createHash('sha256').update(parsed.data.token, 'utf8').digest('hex') }
}

const ackMessageSchema = z.object({ ok: z.boolean(), reason: z.string().optional() })

export type AckMessage = z.infer<typeof ackMessageSchema>

/** Encodes the ack preamble line the app sends back: `{"ok":true}` or `{"ok":false,"reason":...}`. */
export function encodeAck(ok: boolean, reason?: string): string {
  const message: AckMessage = reason === undefined ? { ok } : { ok, reason }
  return `${JSON.stringify(message)}\n`
}

/** Parses an ack line. Fails closed to `{ ok: false }` on malformed JSON, never throwing. */
export function parseAck(line: string): AckMessage {
  const parsed = ackMessageSchema.safeParse(safeJsonParse(line))
  return parsed.success ? parsed.data : { ok: false }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
