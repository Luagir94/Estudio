// IPC-backed port (mcp-app-control task 15.1): crosses the preload bridge via
// `window.api.mcp`, then Zod-parses the response before handing typed data to
// TanStack Query — same two-directional parsing rule as every other adapter
// (`ajustesApi.ts`). Only the three channels this PR's card calls;
// `setPermission` (PR16) and `listActivity`/`onActivityChanged` (PR17/18)
// join this module and `window.d.ts`'s `mcp` entry when their own callers
// land, same incremental-typing convention as every other domain there.
import {
  issueMcpTokenResultSchema,
  mcpStatusResultSchema,
  revokeMcpTokenResultSchema,
  type IssueMcpTokenResult,
  type McpStatusResult,
  type RevokeMcpTokenResult
} from '../../../shared/ipc/mcp'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

/** One entry for the whole card: unlike the per-provider CLI entries, `mcp:status` has no per-item identity to key on. */
export const MCP_STATUS_QUERY_KEY = ['mcp', 'status'] as const

// The bridge never throws — it resolves an `IpcResult` envelope. This error
// preserves the envelope's typed `code` across the throw, unlike a plain
// `Error`, exactly like `AjustesApiError`.
export class McpApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'McpApiError'
  }
}

export interface McpApi {
  status(): Promise<McpStatusResult>
  /** Issues the FIRST token, or rotates the current one — the SAME call either way (design D7/D8). */
  issueToken(): Promise<IssueMcpTokenResult>
  revokeToken(): Promise<RevokeMcpTokenResult>
}

export const mcpApi: McpApi = {
  async status() {
    return unwrapIpcResult(await window.api.mcp.status(), mcpStatusResultSchema, McpApiError)
  },
  async issueToken() {
    return unwrapIpcResult(await window.api.mcp.issueToken(), issueMcpTokenResultSchema, McpApiError)
  },
  async revokeToken() {
    return unwrapIpcResult(await window.api.mcp.revokeToken(), revokeMcpTokenResultSchema, McpApiError)
  }
}
