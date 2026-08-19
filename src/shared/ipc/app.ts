// Shared IPC contract for the cross-cutting `app:*` channels (design §2).
// `app:exportJson` ships in slice 5; `app:openExternal` ships here because
// slice 2b's subject detail screen is the first surface that can open a
// campus link (delivery decision "security-ordering defect").
import { z } from 'zod'

export { MENU_EXPORT_REQUESTED_CHANNEL } from './channels'

export const openExternalInputSchema = z.object({
  url: z.string()
})

export type OpenExternalInput = z.infer<typeof openExternalInputSchema>

// --- app:exportJson result ------------------------------------------------

// A no-payload command. `canceled: true` when the user dismisses the save
// dialog without choosing a path (spec: "Export from sidebar footer" — "a
// save dialog opens... a JSON file is written on confirm", implying no file
// write on cancel).
export const exportJsonResultSchema = z.object({
  canceled: z.boolean(),
  filePath: z.string().nullable()
})

export type ExportJsonResult = z.infer<typeof exportJsonResultSchema>

// Push-event channel name (design §1: "parsed results (and
// `menu:export-requested` push event) go main→renderer"). The native File
// menu's click handler runs in MAIN, so it sends this event to the focused
// renderer instead of duplicating the export flow — the renderer's listener
// calls the SAME `app.exportJson()` mutation the sidebar footer button uses,
// guaranteeing "the identical flow" (spec: "Export from File menu").
//
// Re-exported here for convenience (main/index.ts, renderer, tests). The
// canonical declaration lives in `./channels` — a zod-free module — because
// preload/index.ts must import the constant from THAT file directly, never
// from this one (this module imports `zod`, which breaks the sandboxed
// preload bundle; see channels.ts's own comment).
