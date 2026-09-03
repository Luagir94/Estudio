import { describe, expect, it } from 'vitest'
import { MCP_SLICE_VALUES } from '../ipc/mcp'
import { MCP_SLICE_CAPABILITIES } from './sliceCapabilities'

// The renderer-facing single source of truth for "which toggle may this
// slice's row show" (mcp-app-control task 16.1/16.2, Card — Permisos MCP).
// Values here are pinned to the REAL tool catalog (PR5-8,
// `src/main/mcp/tools/`), not to the approved `.pen` design's per-row prose —
// `src/main/mcp/tools/toolsCatalog.test.ts` cross-checks this exact map
// against a real combined descriptor array, so a catalog change that adds or
// removes a slice's only read/write tool fails a test instead of drifting
// silently (same parity-guard convention `permissions.test.ts` already
// established for `MCP_SLICE_VALUES`).
describe('MCP_SLICE_CAPABILITIES', () => {
  it('has one entry per curated slice, matching MCP_SLICE_VALUES exactly', () => {
    expect(Object.keys(MCP_SLICE_CAPABILITIES).sort()).toEqual([...MCP_SLICE_VALUES].sort())
  })

  it('materias, carreras, entregas and fechas each have both a read and a write toggle', () => {
    for (const slice of ['materias', 'carreras', 'entregas', 'fechas'] as const) {
      expect(MCP_SLICE_CAPABILITIES[slice]).toEqual({ hasRead: true, hasWrite: true })
    }
  })

  // Approved design's own asymmetry: `clasesTools.ts` exposes only
  // `clases_set_attendance`/`clases_clear_attendance`, both `action: 'write'`.
  it('clases has a write toggle only — no read tool exists for it', () => {
    expect(MCP_SLICE_CAPABILITIES.clases).toEqual({ hasRead: false, hasWrite: true })
  })

  // Approved design's own asymmetry: `horarioTools.ts` exposes only the
  // read-only `horario_week`.
  it('horario has a read toggle only — no write tool exists for it', () => {
    expect(MCP_SLICE_CAPABILITIES.horario).toEqual({ hasRead: true, hasWrite: false })
  })

  // NOT called out by the approved design's row copy (which labels this row
  // "read+write"), but `parcialesTools.ts` exposes only
  // create/update/delete — all `action: 'write'` — no list/detail read tool
  // exists in the real catalog. Derived from the catalog, not from the
  // design's prose, per this task's own instruction.
  it('parciales has a write toggle only — the real catalog has no read tool for it', () => {
    expect(MCP_SLICE_CAPABILITIES.parciales).toEqual({ hasRead: false, hasWrite: true })
  })

  // Same finding as parciales, for the same reason: `finalesTools.ts` exposes
  // only create/update/delete.
  it('finales has a write toggle only, for the same reason as parciales', () => {
    expect(MCP_SLICE_CAPABILITIES.finales).toEqual({ hasRead: false, hasWrite: true })
  })
})
