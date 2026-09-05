import { describe, expect, it } from 'vitest'
import type { CliProbeFailureReason } from '../../../shared/ipc/cli'
import {
  describeCliFailureReason,
  EXECUTION_WARNING,
  unusableFriendlyMessage,
  resolveConnectionTone
} from './connectionDisplay'

// Both strings now name the CLI they belong to — an Antigravity card carrying
// a Claude warning would be worse than no warning at all.
const EXECUTION_WARNING_COPY = EXECUTION_WARNING
const UNUSABLE_FRIENDLY_MESSAGE = unusableFriendlyMessage('claude')

describe('resolveConnectionTone', () => {
  it('maps connected to the ok tone (D7: green — normal working state)', () => {
    expect(resolveConnectionTone('connected')).toBe('ok')
  })

  it('maps not-found to the warn tone (D7: amber — claude simply is not installed, not an error)', () => {
    expect(resolveConnectionTone('not-found')).toBe('warn')
  })

  it('maps unusable to the urgent tone (D7: red — a configured target that failed)', () => {
    expect(resolveConnectionTone('unusable')).toBe('urgent')
  })
})

describe('EXECUTION_WARNING_COPY', () => {
  it('is a non-empty Spanish string matching the approved .pen design copy exactly', () => {
    expect(EXECUTION_WARNING_COPY.length).toBeGreaterThan(0)
    expect(EXECUTION_WARNING_COPY).toBe(
      'Si indicás una ruta a mano, la app va a EJECUTAR ese archivo. Apuntá solo a un ejecutable en el que confíes.'
    )
  })

  // It names NO provider, and that is load-bearing rather than an omission.
  // The three CLIs share one card now, so one sentence covers all of them —
  // and a sentence that named one vendor while sitting under three rows would
  // be worse than no warning at all.
  it('names no CLI', () => {
    expect(EXECUTION_WARNING_COPY).not.toMatch(/Claude|Codex|Antigravity/)
  })
})

describe('UNUSABLE_FRIENDLY_MESSAGE', () => {
  it('is a non-empty Spanish sentence, distinct from a raw technical detail line', () => {
    expect(UNUSABLE_FRIENDLY_MESSAGE.length).toBeGreaterThan(0)
    expect(UNUSABLE_FRIENDLY_MESSAGE).not.toMatch(/^Exited with code|^Probe timed out/)
  })
})

// The renderer's own account of each structured failure reason — the fix for
// "warm Spanish sentence followed by raw English", now that `status.detail`
// is no longer rendered. Every branch of `CliProbeFailureReason` gets its own
// case, plus the `null` fallback for an older/unrecognized payload.
describe('describeCliFailureReason', () => {
  it('localizes an invalid-executable reason, keeping the path the user typed', () => {
    const reason: CliProbeFailureReason = { code: 'invalid-executable', path: 'C:\\bad\\claude.exe' }

    expect(describeCliFailureReason(reason)).toBe(
      'La ruta C:\\bad\\claude.exe no es un ejecutable válido. Revisá la ruta en Ajustes.'
    )
  })

  it('localizes a timeout reason with the configured budget', () => {
    const reason: CliProbeFailureReason = { code: 'timeout', timeoutMs: 4000 }

    expect(describeCliFailureReason(reason)).toBe('El CLI tardó más de 4000 ms en responder. Probá de nuevo.')
  })

  it('localizes an exit-code reason', () => {
    const reason: CliProbeFailureReason = { code: 'exit-code', exitCode: 9 }

    expect(describeCliFailureReason(reason)).toBe('El CLI terminó con un error (código 9). Probá de nuevo.')
  })

  it('localizes a null exit code as "desconocido" rather than the literal null', () => {
    const reason: CliProbeFailureReason = { code: 'exit-code', exitCode: null }

    expect(describeCliFailureReason(reason)).toBe('El CLI terminó con un error (código desconocido). Probá de nuevo.')
  })

  it('localizes an unrecognized-output reason', () => {
    const reason: CliProbeFailureReason = { code: 'unrecognized-output' }

    expect(describeCliFailureReason(reason)).toBe(
      'No entendimos lo que devolvió el CLI. Probá de nuevo, o revisá la ruta en Ajustes.'
    )
  })

  it('falls back to a generic Spanish sentence when no structured reason is present', () => {
    expect(describeCliFailureReason(null)).toBe(
      'No pudimos determinar qué pasó. Probá de nuevo, o revisá la ruta en Ajustes.'
    )
  })
})
