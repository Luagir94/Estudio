// Shared IPC contract for the `indexado:*` channels (attachment-fts-index
// design "Port Contracts" / spec "Manual Sincronizar sync"). `indexado:sync`
// takes no payload — it is a single global operation, not scoped to a
// subject (design "Sync scope") — same no-input-schema precedent as
// `app:exportJson` (`registerAppHandlers.ts`).
import { z } from 'zod'
import { ipcErr, ipcOk, type IpcResult } from './materias'

export { ipcErr, ipcOk, type IpcResult }
export { INDEXADO_STATUS_CHANGED_CHANNEL } from './channels'

export const syncResultSchema = z.object({ enqueued: z.number().int() })

export type SyncResult = z.infer<typeof syncResultSchema>

// Push-event payload (design "Renderer notify"): the subject whose
// attachment list just changed status, so the renderer's TanStack Query
// invalidation (slice 2c) can target `['adjuntos', subjectId]` without a
// full refetch of every subject.
export const indexStatusChangedPayloadSchema = z.object({ subjectId: z.number().int() })

export type IndexStatusChangedPayload = z.infer<typeof indexStatusChangedPayloadSchema>
