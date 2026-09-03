import { describe, expect, it } from 'vitest'
import { MCP_SLICE_VALUES } from '../../../shared/ipc/mcp'
import { isAllowed, MCP_SLICES, type PermissionMatrix } from './permissions'

describe('MCP_SLICES', () => {
  it('lists exactly the 8 curated slices', () => {
    expect(MCP_SLICES).toEqual([
      'materias',
      'carreras',
      'entregas',
      'fechas',
      'clases',
      'parciales',
      'finales',
      'horario'
    ])
  })

  // Task 14.1: `shared/ipc/mcp.ts` duplicates this list as
  // `MCP_SLICE_VALUES` rather than importing it (that direction would make
  // `shared/` depend on `src/main/`, inverting this codebase's layering —
  // see that module's own header comment). This is the OTHER half of the
  // parity guard: main is free to import shared, so this side can assert
  // the two never drift apart.
  it('matches shared/ipc/mcp.ts MCP_SLICE_VALUES exactly, same order', () => {
    expect(MCP_SLICES).toEqual(MCP_SLICE_VALUES)
  })
})

describe('isAllowed', () => {
  it('denies every slice/action when the matrix is empty (spec: fresh token has no access)', () => {
    const matrix: PermissionMatrix = {}
    for (const slice of MCP_SLICES) {
      expect(isAllowed(matrix, slice, 'read')).toBe(false)
      expect(isAllowed(matrix, slice, 'write')).toBe(false)
    }
  })

  it('allows read only when canRead is granted, independent of write', () => {
    const matrix: PermissionMatrix = { materias: { canRead: true, canWrite: false } }
    expect(isAllowed(matrix, 'materias', 'read')).toBe(true)
    expect(isAllowed(matrix, 'materias', 'write')).toBe(false)
  })

  it('allows write only when canWrite is granted, independent of read', () => {
    const matrix: PermissionMatrix = { entregas: { canRead: false, canWrite: true } }
    expect(isAllowed(matrix, 'entregas', 'write')).toBe(true)
    expect(isAllowed(matrix, 'entregas', 'read')).toBe(false)
  })

  it('does not leak a granted slice into an ungranted one', () => {
    const matrix: PermissionMatrix = { materias: { canRead: true, canWrite: true } }
    expect(isAllowed(matrix, 'carreras', 'read')).toBe(false)
    expect(isAllowed(matrix, 'carreras', 'write')).toBe(false)
  })
})
