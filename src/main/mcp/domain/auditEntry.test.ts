import { describe, expect, it } from 'vitest'
import { MCP_SLICES } from './permissions'
import {
  authFailedSummary,
  buildOutcomeSummary,
  denialSummary,
  invalidSummary,
  MAX_SUMMARY_LENGTH,
  truncateSummary,
  type AuditSummaryDescriptor
} from './auditEntry'

// Sentinel marker standing in for a free-text field (name, notas, título…)
// that MUST NEVER survive into a persisted audit summary (threat-matrix:
// token/PII never in summary).
const SENTINEL = 'SENTINEL_FREE_TEXT_LEAK_MARKER_9f3c'

describe('buildOutcomeSummary', () => {
  it('never leaks the sentinel free-text input, across a fixture shaped like every one of the 8 slices', () => {
    for (const slice of MCP_SLICES) {
      const descriptor: AuditSummaryDescriptor<{ id: number; freeText: string }, { id: number }> = {
        summarize: (input, result) => `${slice}_write id=${result ? result.id : input.id}`
      }
      const input = { id: 7, freeText: SENTINEL }

      const summary = buildOutcomeSummary(descriptor, input, { id: 7 })

      expect(summary).not.toContain(SENTINEL)
      expect(summary).toBe(`${slice}_write id=7`)
    }
  })

  it('bounds an oversized summarize() result to MAX_SUMMARY_LENGTH characters', () => {
    const descriptor: AuditSummaryDescriptor<null, null> = { summarize: () => 'x'.repeat(300) }

    const summary = buildOutcomeSummary(descriptor, null, null)

    expect(summary).toHaveLength(MAX_SUMMARY_LENGTH)
  })
})

describe('truncateSummary', () => {
  it('leaves a summary at or under the max length untouched', () => {
    expect(truncateSummary('materias_create id=1')).toBe('materias_create id=1')
  })

  it('cuts a summary longer than the max to exactly the max length', () => {
    expect(truncateSummary('a'.repeat(250))).toHaveLength(MAX_SUMMARY_LENGTH)
  })
})

describe('denialSummary', () => {
  it('names the slice and the missing permission when no cause is given', () => {
    expect(denialSummary('carreras', 'write')).toBe('denied: carreras write not granted')
  })

  it('names the session-terminated cause for a stale connection', () => {
    expect(denialSummary('entregas', 'write', 'session')).toBe('denied: entregas write, session terminated')
  })

  it('never embeds anything beyond slice/action/cause (no payload content possible by signature)', () => {
    const summary = denialSummary('materias', 'read')
    expect(summary).not.toContain(SENTINEL)
  })
})

describe('invalidSummary', () => {
  it('names the tool and reports validation failure, nothing else', () => {
    expect(invalidSummary('materias_create')).toBe('materias_create: validation failed')
  })
})

describe('authFailedSummary', () => {
  it('reports a missing token without ever taking a token value as input', () => {
    expect(authFailedSummary('missing-token')).toBe('handshake rejected: missing token')
  })

  it('reports a token mismatch without ever taking a token value as input', () => {
    expect(authFailedSummary('token-mismatch')).toBe('handshake rejected: token mismatch')
  })
})
