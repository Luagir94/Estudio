import { ipcMain } from 'electron'
import log from 'electron-log'
import {
  buildServerEntry,
  type IpcResult,
  type IssueMcpTokenResult,
  ipcErr,
  ipcOk,
  type ListMcpActivityResult,
  listMcpActivityInputSchema,
  type ListMcpClientTargetsResult,
  type McpClientConfigWriteResult,
  type McpStatusResult,
  parsePayload,
  removeMcpClientConfigInputSchema,
  type RevokeMcpTokenResult,
  type SetMcpPermissionResult,
  setMcpPermissionInputSchema,
  writeMcpClientConfigInputSchema
} from '../../../shared/ipc/mcp'
import { type ClientConfigWriter, createClientConfigWriter } from '../adapters/clientConfigWriter'
import type { McpService } from '../mcpService'

/**
 * Registers the `mcp:*` renderer control-plane channels (task 14.3, design
 * "`mcp:*` IPC contract" table). Every handler calls `mcpService` — NEVER
 * the permission or audit repositories directly. The tasks artifact
 * corrected this dependency against the proposal's original table: the
 * design's own data-flow diagram is `registerMcpHandlers → mcpService →
 * repos`, and reaching around the service into the repositories would
 * bypass the token lifecycle, the listener reconcile and the connection
 * drain PR9 built as this feature's security core.
 *
 * No caller invokes any of this yet — the Ajustes cards that call
 * `issueToken`/`setPermission` ship in PR15/PR16, and the Actividad screen
 * that calls `listActivity` ships in PR17/PR18. Nothing here mints a token
 * or grants a slice on its own.
 */
export function registerMcpHandlers(
  service: McpService,
  clientConfigWriter: ClientConfigWriter = createClientConfigWriter()
): void {
  ipcMain.handle('mcp:status', (): IpcResult<McpStatusResult> => {
    try {
      return ipcOk(service.getStatus())
    } catch (error) {
      log.error('mcp:status failed', error)
      return ipcErr('STATUS_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('mcp:issueToken', (): IpcResult<IssueMcpTokenResult> => {
    try {
      return ipcOk(service.issueToken())
    } catch (error) {
      log.error('mcp:issueToken failed', error)
      return ipcErr('ISSUE_TOKEN_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('mcp:revokeToken', (): IpcResult<RevokeMcpTokenResult> => {
    try {
      return ipcOk(service.revokeToken())
    } catch (error) {
      log.error('mcp:revokeToken failed', error)
      return ipcErr('REVOKE_TOKEN_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('mcp:setPermission', (_event, payload): IpcResult<SetMcpPermissionResult> => {
    const parsed = parsePayload(setMcpPermissionInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      return ipcOk(service.setPermission(parsed.data))
    } catch (error) {
      log.error('mcp:setPermission failed', error)
      return ipcErr('SET_PERMISSION_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('mcp:listActivity', (_event, payload): IpcResult<ListMcpActivityResult> => {
    const parsed = parsePayload(listMcpActivityInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      return ipcOk(service.listActivity(parsed.data.limit))
    } catch (error) {
      log.error('mcp:listActivity failed', error)
      return ipcErr('LIST_ACTIVITY_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  // --- client registration ---------------------------------------------------
  //
  // These three write a file this app does not own. They call the writer
  // directly rather than reaching through `mcpService`, and that is not the
  // exception the header warns about: the service guards the TOKEN lifecycle,
  // the listener and the connection drain, and none of those is touched by
  // merging one key into a third-party config file. What the write does need
  // from the service is the shim path, and it asks for it through the same
  // `getStatus()` every other caller uses.

  ipcMain.handle('mcp:listClientTargets', async (): Promise<IpcResult<ListMcpClientTargetsResult>> => {
    try {
      return ipcOk(await clientConfigWriter.list())
    } catch (error) {
      log.error('mcp:listClientTargets failed', error)
      return ipcErr('LIST_CLIENT_TARGETS_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('mcp:writeClientConfig', async (_event, payload): Promise<IpcResult<McpClientConfigWriteResult>> => {
    const parsed = parsePayload(writeMcpClientConfigInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      // The entry is built HERE, from this app's own shim path and the token
      // the caller holds — the renderer never dictates `command` or `args`.
      const entry = buildServerEntry(service.getStatus().shimPath, parsed.data.token)
      const outcome = await clientConfigWriter.write(parsed.data.target, entry)

      // The refusal codes are the point of this channel: "your config file is
      // not valid JSON" is something a student can act on, and it is exactly
      // what a silent overwrite would have destroyed instead of reporting.
      return outcome.ok ? ipcOk(outcome.result) : ipcErr(outcome.code, outcome.message)
    } catch (error) {
      log.error('mcp:writeClientConfig failed', error)
      return ipcErr('WRITE_CLIENT_CONFIG_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('mcp:removeClientConfig', async (_event, payload): Promise<IpcResult<McpClientConfigWriteResult>> => {
    const parsed = parsePayload(removeMcpClientConfigInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      const outcome = await clientConfigWriter.remove(parsed.data.target)
      return outcome.ok ? ipcOk(outcome.result) : ipcErr(outcome.code, outcome.message)
    } catch (error) {
      log.error('mcp:removeClientConfig failed', error)
      return ipcErr('REMOVE_CLIENT_CONFIG_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
