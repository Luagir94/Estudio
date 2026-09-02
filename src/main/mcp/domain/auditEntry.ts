import type { McpAction, McpSlice } from './permissions'

// Audit outcome vocabulary and summary builders (design "Audit summary
// contract", N2/N3). Outcomes: the spec's own `success`/`denied`/
// `auth-failed`, extended where the spec is silent with `invalid`/`error`.
// Summaries are built by these domain functions, NEVER by truncating or
// serializing a raw payload — that is the whole point of this module.

export type AuditOutcome = 'success' | 'denied' | 'invalid' | 'error' | 'auth-failed'

/** Persisted column length budget (design: "≤200 chars, built by domain, identifiers only"). */
export const MAX_SUMMARY_LENGTH = 200

/** Bounds any built summary to the persisted column's length budget. */
export function truncateSummary(summary: string): string {
  return summary.length > MAX_SUMMARY_LENGTH ? summary.slice(0, MAX_SUMMARY_LENGTH) : summary
}

/**
 * The slice of a real `ToolDescriptor` (`toolDescriptor.ts`'s `defineTool`,
 * PR3) this builder needs: its mandatory, per-tool `summarize` callback.
 * `summarize` is the ONLY place free-text tool input may be read at all —
 * and it is contracted to return identifiers only (design "Audit summary
 * contract"), never a serialized payload.
 */
export interface AuditSummaryDescriptor<Input, Result> {
  summarize: (input: Input, result: Result | null) => string
}

/**
 * Builds a success/error audit summary. Does no serialization of its own:
 * it calls the descriptor's `summarize` and bounds the result, nothing
 * else — every byte of the input beyond what `summarize` chooses to
 * reference is structurally unreachable here.
 */
export function buildOutcomeSummary<Input, Result>(
  descriptor: AuditSummaryDescriptor<Input, Result>,
  input: Input,
  result: Result | null
): string {
  return truncateSummary(descriptor.summarize(input, result))
}

/**
 * `denied: <slice> <action> not granted` for an ordinary permission denial,
 * or `denied: <slice> <action>, session terminated` when the connection
 * itself is stale (design D8's rotate/revoke drain). Takes only enum/slice
 * arguments — no payload content can reach this string by construction.
 */
export function denialSummary(slice: McpSlice, action: McpAction, cause?: 'session'): string {
  return cause === 'session'
    ? `denied: ${slice} ${action}, session terminated`
    : `denied: ${slice} ${action} not granted`
}

/** `<toolName>: validation failed` — never the rejected payload or issue values. */
export function invalidSummary(toolName: string): string {
  return `${toolName}: validation failed`
}

export type AuthFailureReason = 'missing-token' | 'token-mismatch'

/**
 * `handshake rejected: missing token` | `handshake rejected: token
 * mismatch`. Takes a closed-set REASON, never a token — the token value
 * must never be read into any string that reaches audit or electron-log
 * (spec "Token never appears in audit or log output").
 */
export function authFailedSummary(reason: AuthFailureReason): string {
  return reason === 'missing-token' ? 'handshake rejected: missing token' : 'handshake rejected: token mismatch'
}
