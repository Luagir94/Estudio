// Shared IPC contract for the `mcp:*` channels (mcp-app-control design "`mcp:*`
// IPC contract"). Imported by BOTH main (parses incoming payloads before
// executing) and renderer (parses responses before caching) — same "one
// validation story, no new dependency" convention as every other
// `shared/ipc/*` module (see `materias.ts`'s header).
//
// This is the RENDERER control plane only — issuing/rotating/revoking the
// token, granting slices, reading activity. It ships in this PR with NO
// caller: the Ajustes cards that call `issueToken`/`setPermission` land in
// PR15/PR16, and the Actividad screen that calls `listActivity` lands in
// PR17/PR18. Nothing here mints a token or grants a slice on its own — every
// one of these channels only ever fires in response to an explicit renderer
// call, and none exists yet.
//
// Two spec rules this contract is shaped to make impossible to violate by
// construction:
//   1. The plaintext token is returned ONCE, by `mcp:issueToken`'s result —
//      `mcpStatusResultSchema` below has no field that could carry it back.
//      Only its hash is ever persisted (design D7), and a hash never appears
//      on this contract either.
//   2. Rotation and revocation both terminate live connections (design D8,
//      already implemented by `mcpService.issueToken`/`revokeToken`, PR9).
//      This module only describes the RESULT shape of those calls
//      (`{ token, issuedAt }` / `{ revoked: true }`); it makes no promise
//      that a connection survives either call — it does not.
import { z } from 'zod'
import { ipcErr, ipcOk, type IpcResult, parsePayload } from './materias'

export { ipcErr, ipcOk, type IpcResult, parsePayload }

// --- slices --------------------------------------------------------------

// The closed set of 8 curated slices (mcp-app-control spec "Exactly 32 tools
// across 8 curated slices"). Duplicated here rather than imported from
// `src/main/mcp/domain/permissions.ts`'s `MCP_SLICES`: that module lives
// under `src/main/`, and a runtime import from `src/main/` into
// `src/shared/ipc/` would invert this codebase's layering (main depends on
// shared, never the reverse) — the renderer would end up transitively
// referencing main-only code through a "shared" module. The colocated test
// for this file asserts the two lists stay identical, so a slice added to
// one side and forgotten on the other fails a test rather than drifting
// silently.
export const MCP_SLICE_VALUES = [
  'materias',
  'carreras',
  'entregas',
  'fechas',
  'clases',
  'parciales',
  'finales',
  'horario'
] as const

export const mcpSliceSchema = z.enum(MCP_SLICE_VALUES)

export type McpSliceContract = z.infer<typeof mcpSliceSchema>

// --- mcp:status ------------------------------------------------------------

export const mcpListenerStateSchema = z.enum(['stopped', 'listening', 'error'])

export type McpListenerState = z.infer<typeof mcpListenerStateSchema>

export const mcpPermissionSchema = z.object({
  slice: mcpSliceSchema,
  canRead: z.boolean(),
  canWrite: z.boolean()
})

export type McpPermission = z.infer<typeof mcpPermissionSchema>

export const mcpStatusResultSchema = z.object({
  listener: mcpListenerStateSchema,
  /** Non-null only when `listener === 'error'` (e.g. a second app instance holding the pipe). */
  listenerError: z.string().nullable(),
  /** `null` before any token has ever been issued. */
  tokenIssuedAt: z.string().nullable(),
  /** Absolute path to the stdio shim an MCP client should spawn (design D2). */
  shimPath: z.string(),
  /** The internal-leg endpoint the listener binds (design D1) — surfaced for troubleshooting, never a secret. */
  endpoint: z.string(),
  /** One entry per curated slice (default `{ canRead: false, canWrite: false }`), never only the granted ones — so a permissions UI can render every toggle without a second round trip. */
  permissions: z.array(mcpPermissionSchema)
})

export type McpStatusResult = z.infer<typeof mcpStatusResultSchema>

// --- mcp:issueToken ----------------------------------------------------------

// No input schema: issuing and rotating are the SAME call (design D7/D8) —
// there is nothing for the caller to specify.
export const issueMcpTokenResultSchema = z.object({
  /** Shown to the user exactly ONCE, at issue time (design D7, spec "Token issue/rotate lives in Ajustes"). Never persisted here, and no other channel in this contract can read it back — only its hash lives in `app_settings`. */
  token: z.string(),
  issuedAt: z.string()
})

export type IssueMcpTokenResult = z.infer<typeof issueMcpTokenResultSchema>

// --- mcp:revokeToken -----------------------------------------------------

export const revokeMcpTokenResultSchema = z.object({ revoked: z.literal(true) })

export type RevokeMcpTokenResult = z.infer<typeof revokeMcpTokenResultSchema>

// --- mcp:setPermission -----------------------------------------------------

export const setMcpPermissionInputSchema = z.object({
  slice: mcpSliceSchema,
  canRead: z.boolean(),
  canWrite: z.boolean()
})

export type SetMcpPermissionInput = z.infer<typeof setMcpPermissionInputSchema>

// Result is the same shape as one entry of `mcp:status`'s `permissions` array.
export const setMcpPermissionResultSchema = mcpPermissionSchema

export type SetMcpPermissionResult = z.infer<typeof setMcpPermissionResultSchema>

// --- mcp:listActivity --------------------------------------------------------

export const listMcpActivityInputSchema = z.object({
  /** Caps the round trip; the audit table itself may hold up to 5,000 rows (design D10). */
  limit: z.number().int().positive().max(500).optional()
})

export type ListMcpActivityInput = z.infer<typeof listMcpActivityInputSchema>

// The spec's own outcome vocabulary (mcp-app-control spec "Every mutation is
// audited"), extended with `invalid`/`error` where the spec is silent — same
// closed set `src/main/mcp/domain/auditEntry.ts`'s `AuditOutcome` owns on the
// main side. Duplicated here for the same reason `MCP_SLICE_VALUES` is: a
// runtime import from `src/main/` would invert this module's layering.
export const mcpAuditOutcomeSchema = z.enum(['success', 'denied', 'invalid', 'error', 'auth-failed'])

export type McpAuditOutcome = z.infer<typeof mcpAuditOutcomeSchema>

export const mcpAuditEntrySchema = z.object({
  id: z.number().int(),
  occurredAt: z.string(),
  /** `null` for `auth-failed` — no tool was ever dispatched. */
  tool: z.string().nullable(),
  slice: z.string().nullable(),
  action: z.enum(['read', 'write']).nullable(),
  outcome: mcpAuditOutcomeSchema,
  /** Identifiers only, never a raw payload (design "Audit summary contract"). */
  summary: z.string(),
  clientName: z.string().nullable(),
  errorCode: z.string().nullable()
})

export type McpAuditEntry = z.infer<typeof mcpAuditEntrySchema>

// Newest-first (spec "Activity trail is visible in-app, newest first") — the
// ordering is the repository's contract, this schema only shapes the rows.
export const listMcpActivityResultSchema = z.array(mcpAuditEntrySchema)

export type ListMcpActivityResult = z.infer<typeof listMcpActivityResultSchema>

// --- push mcp:activity-changed -----------------------------------------------

// The channel NAME lives in `channels.ts` (zod-free, preload-safe); this is
// only the payload shape, consumed by the renderer adapter (PR17).
export const mcpActivityChangedPayloadSchema = z.object({ id: z.number().int() })

export type McpActivityChangedPayload = z.infer<typeof mcpActivityChangedPayloadSchema>
