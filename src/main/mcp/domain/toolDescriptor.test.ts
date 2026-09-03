import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTool, isValidToolName, TOOL_NAME_PATTERN } from './toolDescriptor'

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

describe('defineTool', () => {
  it('returns the descriptor object unchanged, satisfying the ToolDescriptor<S, R> contract (PR3 identity factory)', () => {
    const inputSchema = z.object({ id: z.number().int().positive() })
    const descriptor = defineTool({
      name: 'materias_detail',
      slice: 'materias',
      action: 'read',
      description: 'Reads a subject by id.',
      inputSchema,
      exec: (input) => ({ id: input.id }),
      summarize: (input) => `materias_detail id=${input.id}`
    })

    expect(descriptor.name).toBe('materias_detail')
    expect(descriptor.inputSchema).toBe(inputSchema)
    expect(descriptor.exec({ id: 3 })).toEqual({ id: 3 })
    expect(descriptor.summarize({ id: 3 }, { id: 3 })).toBe('materias_detail id=3')
  })
})
