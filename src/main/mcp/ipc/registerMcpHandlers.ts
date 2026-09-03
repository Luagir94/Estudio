import { ipcMain } from 'electron'
import log from 'electron-log'
import {
  type IpcResult,
  type IssueMcpTokenResult,
  ipcErr,
  ipcOk,
  type ListMcpActivityResult,
  listMcpActivityInputSchema,
  type McpStatusResult,
  parsePayload,
  type RevokeMcpTokenResult,
  type SetMcpPermissionResult,
  setMcpPermissionInputSchema
} from '../../../shared/ipc/mcp'
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
export function registerMcpHandlers(service: McpService): void {
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
}
