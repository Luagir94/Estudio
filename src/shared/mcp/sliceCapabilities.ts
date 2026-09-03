import type { McpSliceContract } from '../ipc/mcp'

// Which capabilities (read/write) each of the 8 curated slices actually has,
// per the REAL tool catalog (PR5-8, `src/main/mcp/tools/`, pinned exact by
// `toolsCatalog.test.ts`'s 32-tool/7-read/25-write assertion) — not per a
// hardcoded pair of booleans and not per the approved `.pen` design's row
// prose. A permissions UI that rendered a toggle for a capability that
// grants nothing would be dishonest, so this map is the single source of
// truth for which toggle a slice's row may show (mcp-app-control task
// 16.1/16.2, Card — Permisos MCP).
//
// Four slices are asymmetric: `clases` and `horario` are the two the
// approved design's own row copy calls out ("solo asistencia" / "solo
// lectura"). `parciales` and `finales` are NOT called out by that copy
// (which labels both rows "read+write"), but the real catalog
// (`parcialesTools.ts`, `finalesTools.ts`) exposes only create/update/delete
// for each — no list/detail read tool exists for either. This map follows
// the catalog, the tested and shipped source of truth, over the design's
// prose. `toolsCatalog.test.ts` cross-checks every entry here against a real
// combined descriptor array, so a future catalog change that adds or removes
// a slice's only read/write tool fails a test instead of drifting silently.
export interface McpSliceCapability {
  hasRead: boolean
  hasWrite: boolean
}

export const MCP_SLICE_CAPABILITIES: Record<McpSliceContract, McpSliceCapability> = {
  materias: { hasRead: true, hasWrite: true },
  carreras: { hasRead: true, hasWrite: true },
  entregas: { hasRead: true, hasWrite: true },
  fechas: { hasRead: true, hasWrite: true },
  clases: { hasRead: false, hasWrite: true },
  parciales: { hasRead: false, hasWrite: true },
  finales: { hasRead: false, hasWrite: true },
  horario: { hasRead: true, hasWrite: false }
}
