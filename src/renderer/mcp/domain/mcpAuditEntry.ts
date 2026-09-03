// Pure, framework-free domain module (mcp-app-control task 17.1). MUST NOT
// import electron or better-sqlite3 — enforced by
// tooling/dependencyGuard.mts's no-electron-or-sqlite-in-domain rule (see
// tooling/dependencyGuard.test.ts).
//
// The wire shape from `shared/ipc/mcp.ts` (`McpAuditEntry`) IS the entity
// here — an audit row is exactly what the main process already computed,
// there is no richer client-side model to build on top of it. What this
// module adds is the one thing the wire contract deliberately does not
// carry: how an `outcome` value maps to what the Actividad MCP screen shows
// (approved `.pen` design, Engram `sdd/mcp-app-control/approved-ui-design`
// obs #582, "Screen — Actividad MCP" outcome chip table) — same
// "known-set map + never-blank fallback" convention `describeIpcErrorCode`
// (`shared/lib/ipcErrorCopy.ts`) and `resolveConnectionTone`
// (`ajustes/domain/connectionDisplay.ts`) already established for this
// codebase's other closed vocabularies.
import type { McpAuditEntry, McpAuditOutcome } from '../../../shared/ipc/mcp'
import i18n from '../../i18n'

export type { McpAuditEntry, McpAuditOutcome }

/**
 * Semantic chip color, decoupled from any Tailwind class name — same
 * `ConnectionTone` naming/purpose as `ajustes/domain/connectionDisplay.ts`.
 */
export type McpOutcomeTone = 'ok' | 'warn' | 'urgent'

export interface McpOutcomeDisplay {
  label: string
  tone: McpOutcomeTone
}

/**
 * Every outcome the wire contract's closed enum (`mcpAuditOutcomeSchema`,
 * `shared/ipc/mcp.ts`) can carry, per the approved design's outcome table:
 * success -> ok/"OK", denied -> urgent/"Denegado",
 * auth-failed -> urgent/"Auth fallida", invalid and error both collapse to
 * the SAME warn/"Inválido" treatment (the design draws one chip style for
 * both). Typed as `Record<McpAuditOutcome, ...>` so a value added to that
 * enum without a matching entry here fails `npm run typecheck`, not a
 * silent blank chip at runtime once PR18 renders it.
 */
const OUTCOME_DISPLAY: Record<McpAuditOutcome, McpOutcomeDisplay> = {
  success: { label: i18n.t('mcp:mcpActivityScreen.outcome.success'), tone: 'ok' },
  denied: { label: i18n.t('mcp:mcpActivityScreen.outcome.denied'), tone: 'urgent' },
  'auth-failed': { label: i18n.t('mcp:mcpActivityScreen.outcome.authFailed'), tone: 'urgent' },
  invalid: { label: i18n.t('mcp:mcpActivityScreen.outcome.invalid'), tone: 'warn' },
  error: { label: i18n.t('mcp:mcpActivityScreen.outcome.invalid'), tone: 'warn' }
}

function isKnownMcpAuditOutcome(value: string): value is McpAuditOutcome {
  return Object.prototype.hasOwnProperty.call(OUTCOME_DISPLAY, value)
}

/**
 * Resolves an outcome to its chip label/tone. Accepts a plain `string`, not
 * only `McpAuditOutcome`: the value crossing the bridge is already
 * Zod-validated against the closed enum by `mcpActivityApi.ts`'s
 * `listActivity`, but this function must still answer safely for a value
 * one schema revision ahead of this map (main ships a 6th outcome before the
 * renderer is rebuilt) — it falls back to the SAME invalid/warn treatment
 * the closed set's own `invalid`/`error` entries already use, never to a
 * blank label, matching `describeIpcErrorCode`'s standing "unknown code
 * never resolves to blank" rule for IPC error codes.
 */
export function describeMcpAuditOutcome(outcome: string): McpOutcomeDisplay {
  if (isKnownMcpAuditOutcome(outcome)) {
    return OUTCOME_DISPLAY[outcome]
  }
  return { label: i18n.t('mcp:mcpActivityScreen.outcome.invalid'), tone: 'warn' }
}
