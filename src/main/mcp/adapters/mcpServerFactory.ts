import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import log from 'electron-log'
import type { z } from 'zod'
import { parsePayload } from '../../../shared/ipc/materias'
import type { AuditOutcome } from '../domain/auditEntry'
import { denialSummary, invalidSummary } from '../domain/auditEntry'
import type { McpAction, McpSlice } from '../domain/permissions'
import type { ToolDescriptor } from '../domain/toolDescriptor'

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

function errorResult(code: string, message?: string): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ code, message: message ?? code }) }], isError: true }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
        errorResult('SESSION_TERMINATED'),
        'denied',
        denialSummary(descriptor.slice, descriptor.action, 'session')
      )
    }
    if (!deps.authorize(descriptor.slice, descriptor.action)) {
      return audited(errorResult('PERMISSION_DENIED'), 'denied', denialSummary(descriptor.slice, descriptor.action))
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
      return audited(errorResult(failure.error.code, failure.error.message), 'invalid', invalidSummary(descriptor.name))
    }

    connection.inFlightCount += 1
    try {
      const result = await descriptor.exec(parsed.data)
      return result === null
        ? audited(errorResult('NOT_FOUND'), 'error', descriptor.summarize(parsed.data, null))
        : audited(okResult(result), 'success', descriptor.summarize(parsed.data, result))
    } catch (error) {
      log.error(`mcp tool ${descriptor.name} failed`, error)
      return audited(
        errorResult('TOOL_FAILED', toErrorMessage(error)),
        'error',
        descriptor.summarize(parsed.data, null)
      )
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
      { description: descriptor.description, inputSchema: advertisedShape },
      createToolHandler(descriptor, connection, deps)
    )
  }
  return { server, connection }
}
