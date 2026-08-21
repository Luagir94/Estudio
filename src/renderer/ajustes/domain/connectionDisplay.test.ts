import { describe, expect, it } from 'vitest'
import { executionWarningCopy, unusableFriendlyMessage, resolveConnectionTone } from './connectionDisplay'

// Both strings now name the CLI they belong to — an Antigravity card carrying
// a Claude warning would be worse than no warning at all.
const EXECUTION_WARNING_COPY = executionWarningCopy('claude')
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
      'La app va a EJECUTAR el archivo que indiques acá. Apuntá solo a un ejecutable de Claude Code en el que confíes.'
    )
  })
})

describe('UNUSABLE_FRIENDLY_MESSAGE', () => {
  it('is a non-empty Spanish sentence, distinct from a raw technical detail line', () => {
    expect(UNUSABLE_FRIENDLY_MESSAGE.length).toBeGreaterThan(0)
    expect(UNUSABLE_FRIENDLY_MESSAGE).not.toMatch(/^Exited with code|^Probe timed out/)
  })
})
