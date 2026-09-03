import { describe, expect, it } from 'vitest'
import { describeMcpAuditOutcome } from './mcpAuditEntry'

// Vocabulary and colours are fixed by the approved `.pen` design
// (`sdd/mcp-app-control/approved-ui-design`, obs #582, "Screen — Actividad
// MCP" outcome chip table) — this test pins the exact label/tone pairs, not
// just "returns something".
describe('describeMcpAuditOutcome', () => {
  it('maps success to the ok tone and "OK" label', () => {
    expect(describeMcpAuditOutcome('success')).toEqual({ label: 'OK', tone: 'ok' })
  })

  it('maps denied to the urgent tone and "Denegado" label', () => {
    expect(describeMcpAuditOutcome('denied')).toEqual({ label: 'Denegado', tone: 'urgent' })
  })

  it('maps auth-failed to the urgent tone and "Auth fallida" label', () => {
    expect(describeMcpAuditOutcome('auth-failed')).toEqual({ label: 'Auth fallida', tone: 'urgent' })
  })

  it('maps invalid to the warn tone and "Inválido" label', () => {
    expect(describeMcpAuditOutcome('invalid')).toEqual({ label: 'Inválido', tone: 'warn' })
  })

  it('maps error to the SAME warn tone and "Inválido" label as invalid (design groups them together)', () => {
    expect(describeMcpAuditOutcome('error')).toEqual({ label: 'Inválido', tone: 'warn' })
  })

  // Threat/robustness case this domain module exists to close: a future
  // outcome value main ships before the renderer is rebuilt must never
  // resolve to a blank chip — it falls back to the same "Inválido"/warn
  // treatment as the closed set's own invalid/error entries, never to an
  // empty label.
  it('falls back to the invalid/warn treatment for an outcome value outside the known set, never a blank label', () => {
    expect(describeMcpAuditOutcome('some-future-outcome')).toEqual({ label: 'Inválido', tone: 'warn' })
  })
})
