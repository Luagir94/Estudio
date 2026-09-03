import { describe, expect, it } from 'vitest'
import {
  issueMcpTokenResultSchema,
  listMcpActivityInputSchema,
  listMcpActivityResultSchema,
  MCP_SLICE_VALUES,
  mcpActivityChangedPayloadSchema,
  mcpAuditEntrySchema,
  mcpPermissionSchema,
  mcpStatusResultSchema,
  revokeMcpTokenResultSchema,
  setMcpPermissionInputSchema
} from './mcp'

// The parity guard against `main/mcp/domain/permissions.ts`'s `MCP_SLICES`
// (this module's own header comment explains the duplication) lives in
// `main/mcp/domain/permissions.test.ts` instead of here: a colocated test
// under `shared/` is compiled against BOTH `tsconfig.node.json` AND
// `tsconfig.web.json` (the renderer project), and the latter cannot resolve
// a `src/main/` import at all (`tsc` fails the build, not just the guard) —
// `src/main/` test files have no such restriction, so the assertion runs
// from there instead, in the direction this codebase's layering allows.

describe('mcpStatusResultSchema', () => {
  it('accepts a fully-populated status result', () => {
    const result = mcpStatusResultSchema.safeParse({
      listener: 'listening',
      listenerError: null,
      tokenIssuedAt: '2026-09-02T12:00:00.000Z',
      shimPath: 'C:\\app\\resources\\mcp-shim\\index.cjs',
      endpoint: '\\\\.\\pipe\\course-companion-mcp-abcdef0123456789',
      permissions: [{ slice: 'materias', canRead: true, canWrite: false }]
    })
    expect(result.success).toBe(true)
  })

  it('has no field a plaintext token could ride on (spec: shown once, at issue time)', () => {
    const shape = Object.keys(mcpStatusResultSchema.shape)
    expect(shape).not.toContain('token')
    expect(shape).not.toContain('tokenHash')
  })

  it('rejects an unknown listener state', () => {
    const result = mcpStatusResultSchema.safeParse({
      listener: 'connected',
      listenerError: null,
      tokenIssuedAt: null,
      shimPath: 'x',
      endpoint: 'x',
      permissions: []
    })
    expect(result.success).toBe(false)
  })
})

describe('issueMcpTokenResultSchema', () => {
  it('accepts a plaintext token and issuedAt', () => {
    const result = issueMcpTokenResultSchema.safeParse({ token: 'cc_abc123', issuedAt: '2026-09-02T12:00:00.000Z' })
    expect(result.success).toBe(true)
  })
})

describe('revokeMcpTokenResultSchema', () => {
  it('only accepts revoked: true, never false', () => {
    expect(revokeMcpTokenResultSchema.safeParse({ revoked: true }).success).toBe(true)
    expect(revokeMcpTokenResultSchema.safeParse({ revoked: false }).success).toBe(false)
  })
})

describe('setMcpPermissionInputSchema', () => {
  it('accepts one of the 8 curated slices', () => {
    for (const slice of MCP_SLICE_VALUES) {
      expect(setMcpPermissionInputSchema.safeParse({ slice, canRead: true, canWrite: false }).success).toBe(true)
    }
  })

  it('rejects a slice outside the curated set (spec: 8 curated slices only)', () => {
    const result = setMcpPermissionInputSchema.safeParse({ slice: 'adjuntos', canRead: true, canWrite: false })
    expect(result.success).toBe(false)
  })
})

describe('mcpPermissionSchema', () => {
  it('round-trips a granted slice', () => {
    expect(mcpPermissionSchema.safeParse({ slice: 'horario', canRead: true, canWrite: false }).success).toBe(true)
  })
})

describe('listMcpActivityInputSchema', () => {
  it('accepts no payload at all (limit is optional)', () => {
    expect(listMcpActivityInputSchema.safeParse({}).success).toBe(true)
  })

  it('rejects a limit above the 500-row cap (design D10)', () => {
    expect(listMcpActivityInputSchema.safeParse({ limit: 501 }).success).toBe(false)
  })

  it('rejects a non-positive limit', () => {
    expect(listMcpActivityInputSchema.safeParse({ limit: 0 }).success).toBe(false)
  })
})

describe('mcpAuditEntrySchema / listMcpActivityResultSchema', () => {
  it('accepts an auth-failed row with every tool/slice/action field null', () => {
    const result = mcpAuditEntrySchema.safeParse({
      id: 1,
      occurredAt: '2026-09-02T12:00:00.000Z',
      tool: null,
      slice: null,
      action: null,
      outcome: 'auth-failed',
      summary: 'handshake rejected: missing token',
      clientName: null,
      errorCode: null
    })
    expect(result.success).toBe(true)
  })

  it('accepts a successful write row', () => {
    const result = mcpAuditEntrySchema.safeParse({
      id: 2,
      occurredAt: '2026-09-02T12:00:01.000Z',
      tool: 'materias_create',
      slice: 'materias',
      action: 'write',
      outcome: 'success',
      summary: 'materias_create -> id=12',
      clientName: 'claude-desktop',
      errorCode: null
    })
    expect(result.success).toBe(true)
  })

  it('rejects an outcome outside the closed vocabulary', () => {
    const result = mcpAuditEntrySchema.safeParse({
      id: 3,
      occurredAt: '2026-09-02T12:00:02.000Z',
      tool: null,
      slice: null,
      action: null,
      outcome: 'cancelled',
      summary: 'x',
      clientName: null,
      errorCode: null
    })
    expect(result.success).toBe(false)
  })

  it('parses an array of entries', () => {
    const result = listMcpActivityResultSchema.safeParse([])
    expect(result.success).toBe(true)
  })
})

describe('mcpActivityChangedPayloadSchema', () => {
  it('accepts an integer id and nothing else', () => {
    expect(mcpActivityChangedPayloadSchema.safeParse({ id: 42 }).success).toBe(true)
    expect(mcpActivityChangedPayloadSchema.safeParse({ id: 4.2 }).success).toBe(false)
  })
})
