import type { McpAction, McpSlice } from './permissions'

// The client-facing error envelope. Two rules shape every builder here.
//
// (1) An error tells the caller what to DO next. The reader on the other end
// of an MCP connection is usually an agent with no view of this app's UI: a
// bare `PERMISSION_DENIED` leaves it guessing between "ask the user for a
// grant", "retry", and "give up", and it will often pick wrong.
//
// (2) No internal failure text crosses the wire. `toolFailedError` takes the
// tool name and NOTHING else — there is no parameter an exception message,
// a SQL fragment or a stack could be passed through, exactly the way
// `auditEntry.ts`'s `authFailedSummary` takes a closed-set reason and never a
// token. The thrown error is still logged app-side by `mcpServerFactory`,
// and the failure is still recorded in Actividad MCP; a local MCP client is
// simply not where the app's internals get published.

/** One error as it reaches the client, JSON-encoded into the tool result's text content. */
export interface McpToolError {
  code: string
  message: string
}

/**
 * The connection's token was rotated or revoked mid-session (design D8). A
 * reconnect with the current token is the only way forward — no grant change
 * or retry on this connection will help.
 */
export function sessionTerminatedError(): McpToolError {
  return {
    code: 'SESSION_TERMINATED',
    message:
      'This session ended because its token was rotated or revoked. Reconnect using the current token from the app: Ajustes → MCP.'
  }
}

/**
 * The slice/action pair carries the whole remedy, so it is named outright.
 * The "next call" wording is not filler: `mcpService.authorize` reads the
 * permission matrix fresh on every call, so a grant really does take effect
 * without a reconnect, and telling a client otherwise would send it through
 * a handshake it does not need.
 */
export function permissionDeniedError(slice: McpSlice, action: McpAction): McpToolError {
  return {
    code: 'PERMISSION_DENIED',
    message: `The "${slice}" slice does not grant ${action} access. A person can enable it in the app: Ajustes → MCP → Permisos. It applies to the next call, with no reconnect.`
  }
}

/**
 * `exec` resolved `null`, which every tool in this catalog uses to mean "no
 * such row" (the IPC handlers' own convention). The useful next step is
 * almost always to go get a real id rather than to retry the same one.
 */
export function notFoundError(toolName: string): McpToolError {
  return {
    code: 'NOT_FOUND',
    message: `${toolName} found no matching record. List the slice first to get a valid id, then retry — repeating this call with the same id will not succeed.`
  }
}

/**
 * `exec` threw. The caller is told which tool failed and where the details
 * live, and nothing else: see rule (2) in this module's header.
 */
export function toolFailedError(toolName: string): McpToolError {
  return {
    code: 'TOOL_FAILED',
    message: `${toolName} failed while accessing the local database. The app logged the details and recorded the attempt in Ajustes → MCP → Actividad; ask a person to check there.`
  }
}

/**
 * Validation rejected the caller's payload. Unlike every other builder here,
 * this one passes the contract's OWN code and message straight through: those
 * are produced by `src/shared/ipc/*`'s schemas and describe the caller's
 * input (`endsOn.beforeStart`, a missing field), not this app's internals —
 * withholding them would hide the one thing the caller can actually fix.
 */
export function invalidInputError(code: string, message: string | undefined): McpToolError {
  return { code, message: message ?? code }
}
