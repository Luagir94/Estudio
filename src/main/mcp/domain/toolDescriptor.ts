import type { z } from 'zod'
import type { McpAction, McpSlice } from './permissions'

// Tool naming rule (design "defineTool and schema mapping": naming
// `^[a-zA-Z0-9_-]{1,64}$`, e.g. `materias_create`, `carreras_update_period`)
// plus the `ToolDescriptor<S, R>` contract every one of the 32 catalog tools
// (PR5-8) is built against, and the `defineTool` identity factory that
// enforces it at the call site via generic inference.

export const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

/** Validates a tool name against the MCP-safe naming rule every catalog entry must satisfy. */
export function isValidToolName(name: string): boolean {
  return TOOL_NAME_PATTERN.test(name)
}

/**
 * One MCP tool, over the existing `src/shared/ipc/<slice>.ts` contract for
 * `inputSchema` (design "defineTool and schema mapping"). `exec` mirrors the
 * IPC handlers' own convention: a `null` result means NOT_FOUND. `summarize`
 * is REQUIRED — it is the ONLY place a tool's input/result may be read for
 * the audit trail, and it is contracted to return identifiers only (design
 * "Audit summary contract"), never a serialized payload.
 */
// `exec`/`summarize` are declared with METHOD shorthand syntax on purpose,
// not as arrow-typed properties: TypeScript checks method parameters
// bivariantly, which is what lets `mcpServerFactory.ts` hold every tool's
// differently-shaped `ToolDescriptor<S, R>` in one `ToolDescriptor<z.ZodObject,
// unknown>[]` array. An arrow-typed property would be checked
// contravariantly under `strict`/`strictFunctionTypes` and reject that
// assignment outright.
export interface ToolDescriptor<S extends z.ZodObject, R> {
  name: string
  slice: McpSlice
  action: McpAction
  description: string
  inputSchema: S
  exec(input: z.output<S>): Promise<R | null> | R | null
  summarize(input: z.output<S>, result: R | null): string
}

/**
 * Identity factory: returns its argument unchanged. Its only job is to let
 * every call site declare a tool as a plain object literal while `S`/`R` are
 * still inferred from that literal — a `satisfies ToolDescriptor<...>`
 * assertion could not infer `S`/`R` the same way.
 */
export function defineTool<S extends z.ZodObject, R>(descriptor: ToolDescriptor<S, R>): ToolDescriptor<S, R> {
  return descriptor
}
