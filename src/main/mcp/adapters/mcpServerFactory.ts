import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import log from 'electron-log'
import type { z } from 'zod'
import { parsePayload } from '../../../shared/ipc/materias'
import type { AuditOutcome } from '../domain/auditEntry'
import { denialSummary, invalidSummary } from '../domain/auditEntry'
import type { McpAction, McpSlice } from '../domain/permissions'
import { annotationsFor } from '../domain/toolAnnotations'
import type { ToolDescriptor } from '../domain/toolDescriptor'
import {
  invalidInputError,
  notFoundError,
  permissionDeniedError,
  sessionTerminatedError,
  toolFailedError,
  type McpToolError
} from '../domain/toolErrors'

// Per-connection state that mcpService (PR9) reads and mutates from OUTSIDE
// this wrapper: `stale` is flipped true on rotate/revoke (design D8), and
// `settle` is replaced with a drain-detection callback so mcpService can
// close the socket once every in-flight call has returned. This module only
// ever increments/decrements `inFlightCount` and calls `settle()` — it never
// interprets what "stale" or "settle" mean beyond that.
export interface McpConnectionState {
  stale: boolean
  inFlightCount: number
  settle: () => void
}

export function createConnectionState(): McpConnectionState {
  return { stale: false, inFlightCount: 0, settle: () => {} }
}

export interface McpAuditRecord {
  tool: string
  slice: McpSlice
  action: McpAction
  outcome: AuditOutcome
  summary: string
}

export interface McpServerFactoryDeps {
  authorize: (slice: McpSlice, action: McpAction) => boolean
  audit: (record: McpAuditRecord) => void
}

function okResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] }
}

/**
 * Envelopes an error the domain already built. Deliberately takes the whole
 * `McpToolError` rather than loose strings: `domain/toolErrors.ts` is the
 * only place a client-facing message is composed, which is what keeps a raw
 * exception from ever being handed in here by a later caller.
 */
function errorResult(error: McpToolError): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(error) }], isError: true }
}

/**
 * Builds the per-tool dispatcher: stale -> authorize -> parse -> exec ->
 * envelope -> audit (design "defineTool and schema mapping"). Exported
 * separately from `createConnectionMcpServer` so the order above is
 * testable directly, without a live SDK transport round trip for every case.
 */
export function createToolHandler<S extends z.ZodObject, R>(
  descriptor: ToolDescriptor<S, R>,
  connection: McpConnectionState,
  deps: McpServerFactoryDeps
): (args: unknown) => Promise<CallToolResult> {
  return async (args) => {
    const audited = (result: CallToolResult, outcome: AuditOutcome, summary: string): CallToolResult => {
      deps.audit({ tool: descriptor.name, slice: descriptor.slice, action: descriptor.action, outcome, summary })
      return result
    }

    if (connection.stale) {
      return audited(
        errorResult(sessionTerminatedError()),
        'denied',
        denialSummary(descriptor.slice, descriptor.action, 'session')
      )
    }
    if (!deps.authorize(descriptor.slice, descriptor.action)) {
      return audited(
        errorResult(permissionDeniedError(descriptor.slice, descriptor.action)),
        'denied',
        denialSummary(descriptor.slice, descriptor.action)
      )
    }

    // SECOND, full-schema parse — NOT redundant with the SDK's own
    // validation. `server.registerTool` below is handed `descriptor
    // .inputSchema.shape` (the raw per-field schemas) rather than
    // `descriptor.inputSchema` itself, because that is the shape the SDK's
    // `registerTool` accepts; the SDK then rebuilds its own `z.object(shape)`
    // internally to validate incoming args, which DROPS any object-level
    // `.refine`/`.superRefine` the original schema carried (real examples in
    // this repo: `refineSchemeAndScale`, `period.endBeforeStart`,
    // `endsOn.beforeStart` in `shared/ipc/*`). Re-parsing against the FULL
    // `descriptor.inputSchema` here is the only place those refinements are
    // ever enforced for an MCP call — do not remove this as a
    // "simplification", in this or any later PR.
    const parsed = parsePayload(descriptor.inputSchema, args)
    if (!parsed.ok) {
      const { failure } = parsed
      // parsePayload's failure branch is always built by ipcErr(...), i.e.
      // `{ ok: false, error }` — this narrows `IpcResult<never>`'s wider
      // return type down to that shape so `.error` is reachable below.
      if (failure.ok) {
        throw new Error('unreachable: parsePayload failure was ok')
      }
      return audited(
        errorResult(invalidInputError(failure.error.code, failure.error.message)),
        'invalid',
        invalidSummary(descriptor.name)
      )
    }

    connection.inFlightCount += 1
    try {
      const result = await descriptor.exec(parsed.data)
      return result === null
        ? audited(errorResult(notFoundError(descriptor.name)), 'error', descriptor.summarize(parsed.data, null))
        : audited(okResult(result), 'success', descriptor.summarize(parsed.data, result))
    } catch (error) {
      // The thrown error is logged HERE and nowhere else on this path: the
      // envelope below is built from the tool name alone, so nothing the
      // repository put in that message can reach the client.
      log.error(`mcp tool ${descriptor.name} failed`, error)
      return audited(errorResult(toolFailedError(descriptor.name)), 'error', descriptor.summarize(parsed.data, null))
    } finally {
      connection.inFlightCount -= 1
      connection.settle()
    }
  }
}

const SERVER_INFO = { name: 'course-companion', version: '0.1.0' }

/**
 * Builds one `McpServer` for one accepted connection, with every descriptor
 * registered as a tool (design D8: all 32 tools are always listed; grants
 * are checked per call, not per connection). The caller (mcpService, PR9)
 * owns `connect()`ing the returned server to a live transport and owns the
 * returned `connection` state (marking it stale on rotate/revoke).
 */
export function createConnectionMcpServer(
  descriptors: ToolDescriptor<z.ZodObject, unknown>[],
  deps: McpServerFactoryDeps
): { server: McpServer; connection: McpConnectionState } {
  const server = new McpServer(SERVER_INFO)
  const connection = createConnectionState()
  for (const descriptor of descriptors) {
    // Spike B fallback (design "defineTool and schema mapping", PR5 task
    // 5.1): `advertisedShapeOverrides`, when present, replaces individual
    // fields ONLY in the shape handed to the SDK for `tools/list`
    // advertising. `descriptor.inputSchema` itself — what `createToolHandler`
    // re-parses against — is never touched, so real validation stays exact.
    const advertisedShape = descriptor.advertisedShapeOverrides
      ? { ...descriptor.inputSchema.shape, ...descriptor.advertisedShapeOverrides }
      : descriptor.inputSchema.shape
    server.registerTool(
      descriptor.name,
      {
        description: descriptor.description,
        inputSchema: advertisedShape,
        // Derived, never hand-written per tool (`domain/toolAnnotations.ts`):
        // a client reads these to decide what it may run without asking the
        // user, and all four are emitted explicitly so no tool here inherits
        // the protocol's conservative `destructiveHint`/`openWorldHint`
        // defaults by accident.
        annotations: annotationsFor(descriptor)
      },
      createToolHandler(descriptor, connection, deps)
    )
  }
  return { server, connection }
}
