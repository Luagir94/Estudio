// Per-slice permission matrix (design "mcp-slice-permissions", spec "Grants
// default to NONE per slice (fail closed)"). The 8 curated slices match the
// proposal's slice/verb table — no tool exists outside this set (adjuntos,
// indexado, ask, cli, theme, app, planificador and hoy are deliberately
// excluded, spec "Exactly 32 tools across 8 curated slices").

export const MCP_SLICES = [
  'materias',
  'carreras',
  'entregas',
  'fechas',
  'clases',
  'parciales',
  'finales',
  'horario'
] as const

export type McpSlice = (typeof MCP_SLICES)[number]

export type McpAction = 'read' | 'write'

export interface McpSliceGrant {
  canRead: boolean
  canWrite: boolean
}

/**
 * Absence of a slice's row = no access (spec: "Grants default to NONE per
 * slice", "Repository rule: absence of a permission row = no access"). A
 * matrix missing a slice entirely denies exactly like an explicit
 * `{ canRead: false, canWrite: false }` grant for it.
 */
export type PermissionMatrix = Partial<Record<McpSlice, McpSliceGrant>>

/** Default-deny lookup: denies unless the matrix carries an explicit grant for `slice`/`action`. */
export function isAllowed(matrix: PermissionMatrix, slice: McpSlice, action: McpAction): boolean {
  const grant = matrix[slice]
  if (!grant) {
    return false
  }
  return action === 'read' ? grant.canRead : grant.canWrite
}
