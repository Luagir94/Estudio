// IPC-backed port (mcp-app-control task 17.2) for the `mcp:listActivity`
// call and the `mcp:activity-changed` push subscription. Crosses the
// preload bridge via `window.api.mcp.listActivity`/`onActivityChanged`, then
// Zod-parses the response before handing typed data to TanStack Query —
// same two-directional parsing rule as `mcpApi.ts`.
//
// Kept as its OWN adapter file per the tasks plan (Engram
// `sdd/mcp-app-control/tasks` obs #576, PR17), not folded into `mcpApi.ts`
// as that module's own header comment once speculated: `listActivity`
// returns a LIST to page/refetch and `onActivityChanged` is a push
// SUBSCRIPTION with its own unsubscribe lifecycle — a different shape of
// concern from the four request/response calls `mcpApi.ts` owns. PR18's
// container is the only caller of either.
//
// Every field on an audit row was written by the main process from tool
// calls an EXTERNAL CLI made — untrusted display data, never anything to
// execute or interpolate. `listMcpActivityResultSchema.parse(...)` below is
// what enforces that: a malformed or unexpected-shape row (e.g. an outcome
// value outside the closed enum) fails this parse loudly rather than
// reaching a component as trusted data.
import type { McpActivityChangedPayload } from '../../../shared/ipc/mcp'
import {
  listMcpActivityResultSchema,
  type ListMcpActivityInput,
  type ListMcpActivityResult
} from '../../../shared/ipc/mcp'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

/** One entry, not per-limit: the container drives paging through `input.limit`, not through a second cache key. */
export const MCP_ACTIVITY_QUERY_KEY = ['mcp', 'activity'] as const

// Preserves the envelope's typed `code` across the throw (base class doc) —
// distinct from `McpApiError` so a caller can tell an activity-read failure
// apart from a status/token/permission failure, same "one error class per
// adapter" convention as `IndexadoApiError`/`McpApiError`.
export class McpActivityApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'McpActivityApiError'
  }
}

export interface McpActivityApi {
  /** Newest-first audit rows (repository's own contract — this schema only shapes each row). */
  listActivity(input?: ListMcpActivityInput): Promise<ListMcpActivityResult>
  /**
   * Subscribes to `mcp:activity-changed`, pushed on every audit insert
   * (design D9). Returns an unsubscribe function that MUST be called on
   * unmount — same contract `indexadoApi.onStatusChanged` already
   * documents — or the underlying `ipcRenderer.on` listener stacks across
   * every mount/unmount cycle of the screen that calls this.
   */
  onActivityChanged(callback: (payload: McpActivityChangedPayload) => void): () => void
}

export const mcpActivityApi: McpActivityApi = {
  async listActivity(input) {
    return unwrapIpcResult(
      await window.api.mcp.listActivity(input ?? {}),
      listMcpActivityResultSchema,
      McpActivityApiError
    )
  },
  onActivityChanged(callback) {
    return window.api.mcp.onActivityChanged(callback)
  }
}
