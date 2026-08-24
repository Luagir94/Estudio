import { ipcMain } from 'electron'
import log from 'electron-log'
import { ipcErr, ipcOk, type IpcResult, type SyncResult } from '../../../shared/ipc/indexado'
import type { IndexadoService } from '../indexadoService'

interface RegisterIndexadoHandlersDeps {
  service: IndexadoService
}

/**
 * Registers the `indexado:*` main-process handlers (attachment-fts-index
 * design "Port Contracts", spec "Manual Sincronizar sync"). `indexado:sync`
 * takes no payload — it is a single global operation, not scoped to a
 * subject (design "Sync scope": selects every `index_status != 'indexed'`
 * row) — and returns immediately with the count enqueued; the indexing
 * itself still runs through the service's own background queue. Every
 * branch returns an `IpcResult` — nothing ever throws across the bridge
 * (same convention as `registerAdjuntosHandlers.ts`).
 */
export function registerIndexadoHandlers({ service }: RegisterIndexadoHandlersDeps): void {
  ipcMain.handle('indexado:sync', (): IpcResult<SyncResult> => {
    try {
      return ipcOk({ enqueued: service.syncAll() })
    } catch (error) {
      log.error('indexado:sync failed', error)
      return ipcErr('SYNC_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
