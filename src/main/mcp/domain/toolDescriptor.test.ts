import { describe, expect, it } from 'vitest'
import { isValidToolName, TOOL_NAME_PATTERN } from './toolDescriptor'

describe('isValidToolName', () => {
  it('accepts a real tool name from the catalog', () => {
    expect(isValidToolName('materias_create')).toBe(true)
  })

  it('accepts a single-character name (lower bound)', () => {
    expect(isValidToolName('a')).toBe(true)
  })

  it('accepts a 64-character name (upper bound)', () => {
    expect(isValidToolName('a'.repeat(64))).toBe(true)
  })

  it('rejects a 65-character name (over the upper bound)', () => {
    expect(isValidToolName('a'.repeat(65))).toBe(false)
  })

  it('rejects an empty name', () => {
    expect(isValidToolName('')).toBe(false)
  })

  it('rejects a name with a character outside the allowlist', () => {
    expect(isValidToolName('materias:create')).toBe(false)
  })

  it('matches TOOL_NAME_PATTERN directly for an accepted name', () => {
    expect(TOOL_NAME_PATTERN.test('carreras_update_period')).toBe(true)
  })
})
