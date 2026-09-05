// MCP tool annotations (`readOnlyHint` / `destructiveHint` /
// `idempotentHint` / `openWorldHint`), DERIVED from what a tool does rather
// than hand-written per tool. A client uses these to decide what it may run
// without asking the user, so 32 hand-maintained copies of four booleans is
// exactly the shape of mistake that ends with `carreras_delete` advertising
// itself as read-only.
//
// All four hints are always emitted explicitly, never left to the protocol's
// own defaults — those defaults (`destructiveHint: true`, `openWorldHint:
// true`) are the conservative ones, and silently inheriting them would make
// every read tool in this catalog look like it might delete something on a
// remote service.

/** What a `write` tool does to the row it touches. `read` tools have no effect to declare. */
export const MCP_TOOL_EFFECTS = ['create', 'update', 'delete'] as const

export type McpToolEffect = (typeof MCP_TOOL_EFFECTS)[number]

/**
 * The four hints, structurally compatible with the SDK's own
 * `ToolAnnotations` without this domain module importing it — the adapter
 * (`mcpServerFactory.ts`) is the only place the SDK's type is named, the
 * same way every other `domain/` module here stays free of its transport.
 */
export interface McpToolAnnotations {
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
}

/** The discriminant `annotationsFor` reads — the `action`/`effect` pair every `ToolDescriptor` carries. */
export type AnnotatedTool = { action: 'read' } | { action: 'write'; effect: McpToolEffect }

/**
 * Derives one tool's annotations.
 *
 * `openWorldHint` is `false` for every entry: this catalog reads and writes
 * the app's own local SQLite database and nothing else — there is no remote
 * service behind any of these tools whose state could change between calls.
 *
 * `destructiveHint` follows the MCP spec's own phrasing, "destructive
 * updates" as opposed to "only additive updates": a create is additive, and
 * an update or a delete is not — this app offers no undo for either, so a
 * client is right to confirm both with the user.
 *
 * `update` and `delete` therefore derive the SAME four booleans today. They
 * stay separate values because they describe the tool, not the annotation:
 * whoever writes the next tool declares what it does, and this table decides
 * what that means on the wire.
 */
export function annotationsFor(tool: AnnotatedTool): McpToolAnnotations {
  if (tool.action === 'read') {
    return { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }

  // Repeating a create leaves a second row behind; repeating an update or a
  // delete lands on the state the first call already produced.
  const idempotentHint = tool.effect !== 'create'

  return {
    readOnlyHint: false,
    destructiveHint: tool.effect !== 'create',
    idempotentHint,
    openWorldHint: false
  }
}
