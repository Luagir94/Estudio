// Tool naming rule only (design "defineTool and schema mapping": naming
// `^[a-zA-Z0-9_-]{1,64}$`, e.g. `materias_create`,
// `carreras_update_period`). The `ToolDescriptor<S, R>` interface and the
// `defineTool` factory land in PR3, once the SDK dependency exists to type
// the wrapper against (stale -> authorize -> parse -> exec -> envelope ->
// audit) — this module intentionally stays a single validator until then.

export const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

/** Validates a tool name against the MCP-safe naming rule every catalog entry must satisfy. */
export function isValidToolName(name: string): boolean {
  return TOOL_NAME_PATTERN.test(name)
}
