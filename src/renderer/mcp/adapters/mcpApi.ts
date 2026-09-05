// IPC-backed port (mcp-app-control task 15.1/16.2): crosses the preload
// bridge via `window.api.mcp`, then Zod-parses the response before handing
// typed data to TanStack Query — same two-directional parsing rule as every
// other adapter (`ajustesApi.ts`). Four channels now: PR15's
// status/issueToken/revokeToken plus PR16's setPermission.
//
// `listActivity`/`onActivityChanged` do NOT join this module: per the tasks
// plan (Engram `sdd/mcp-app-control/tasks` obs #576, PR17), they land in
// their OWN adapter, `mcpActivityApi.ts` — this comment's own earlier
// prediction that they would join here was superseded once PR17 actually
// landed. `window.d.ts`'s `mcp` entry still gains both, same
// incremental-typing convention as every other domain there.
import {
  issueMcpTokenResultSchema,
  listMcpClientTargetsResultSchema,
  mcpClientConfigWriteResultSchema,
  mcpStatusResultSchema,
  revokeMcpTokenResultSchema,
  setMcpPermissionResultSchema,
  type IssueMcpTokenResult,
  type ListMcpClientTargetsResult,
  type McpClientConfigWriteResult,
  type McpStatusResult,
  type RemoveMcpClientConfigInput,
  type RevokeMcpTokenResult,
  type SetMcpPermissionInput,
  type SetMcpPermissionResult,
  type WriteMcpClientConfigInput
} from '../../../shared/ipc/mcp'
import { IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

/** One entry for the whole card: unlike the per-provider CLI entries, `mcp:status` has no per-item identity to key on. */
export const MCP_STATUS_QUERY_KEY = ['mcp', 'status'] as const

/** Separate from the status key: this one is invalidated by a write to a client's file, not by a token change. */
export const MCP_CLIENT_TARGETS_QUERY_KEY = ['mcp', 'clientTargets'] as const

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
  /** Sets ONE slice's full grant (both flags together — there is no separate per-flag channel). */
  setPermission(input: SetMcpPermissionInput): Promise<SetMcpPermissionResult>
  /** One row per enabled MCP client: installed on this machine, and registered with this app. */
  listClientTargets(): Promise<ListMcpClientTargetsResult>
  /**
   * Registers this app in one client's own config file.
   *
   * Takes the plaintext token as an ARGUMENT because that is the only place it
   * exists: `mcp:status` cannot read it back (design D7), so the caller passes
   * the same string it would otherwise put on the clipboard.
   */
  writeClientConfig(input: WriteMcpClientConfigInput): Promise<McpClientConfigWriteResult>
  removeClientConfig(input: RemoveMcpClientConfigInput): Promise<McpClientConfigWriteResult>
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
  },
  async setPermission(input) {
    return unwrapIpcResult(await window.api.mcp.setPermission(input), setMcpPermissionResultSchema, McpApiError)
  },
  async listClientTargets() {
    return unwrapIpcResult(await window.api.mcp.listClientTargets(), listMcpClientTargetsResultSchema, McpApiError)
  },
  async writeClientConfig(input) {
    return unwrapIpcResult(await window.api.mcp.writeClientConfig(input), mcpClientConfigWriteResultSchema, McpApiError)
  },
  async removeClientConfig(input) {
    return unwrapIpcResult(
      await window.api.mcp.removeClientConfig(input),
      mcpClientConfigWriteResultSchema,
      McpApiError
    )
  }
}
