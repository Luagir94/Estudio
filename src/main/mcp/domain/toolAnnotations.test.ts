import { describe, expect, it } from 'vitest'
import { annotationsFor, MCP_TOOL_EFFECTS, type McpToolEffect } from './toolAnnotations'

// The annotation table is derived from what a tool DOES, never hand-written
// per tool — 32 hand-maintained copies of four booleans is exactly how a
// `carreras_delete` ends up advertising itself as read-only. These tests pin
// the derivation, and `toolsCatalog.test.ts` pins that every real catalog
// entry declares an effect the derivation can read.

describe('annotationsFor', () => {
  it('marks a read tool read-only, non-destructive and idempotent', () => {
    expect(annotationsFor({ action: 'read' })).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    })
  })

  it('marks a create tool additive and NOT idempotent', () => {
    // Calling `materias_create` twice with the same arguments leaves two
    // subjects behind, which is precisely what `idempotentHint: false` warns
    // a client about before it retries.
    expect(annotationsFor({ action: 'write', effect: 'create' })).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    })
  })

  it('marks an update tool destructive and idempotent', () => {
    // "Destructive" per the MCP spec's own phrasing is "not merely additive":
    // an update overwrites values that this app offers no way to get back.
    expect(annotationsFor({ action: 'write', effect: 'update' })).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    })
  })

  it('marks a delete tool destructive and idempotent', () => {
    expect(annotationsFor({ action: 'write', effect: 'delete' })).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    })
  })

  it('never advertises an open world: every tool in this catalog reads and writes the local database only', () => {
    const everyTool = [
      { action: 'read' } as const,
      ...MCP_TOOL_EFFECTS.map((effect: McpToolEffect) => ({ action: 'write', effect }) as const)
    ]

    for (const tool of everyTool) {
      expect(annotationsFor(tool).openWorldHint).toBe(false)
    }
  })

  it('never marks a write tool read-only, for any effect', () => {
    for (const effect of MCP_TOOL_EFFECTS) {
      expect(annotationsFor({ action: 'write', effect }).readOnlyHint).toBe(false)
    }
  })
})
