import { describe, expect, it } from 'vitest'
import {
  addPrerequisiteInputSchema,
  plannerEntryInputSchema,
  prerequisiteIdInputSchema,
  updatePrerequisiteInputSchema
} from './planificador'

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? []
}

describe('addPrerequisiteInputSchema', () => {
  it('accepts a well-formed edge', () => {
    const parsed = addPrerequisiteInputSchema.safeParse({
      subjectId: 2,
      requiresSubjectId: 1,
      requiredLevel: 'aprobada'
    })

    expect(parsed.success).toBe(true)
  })

  it('accepts the regularizada level', () => {
    const parsed = addPrerequisiteInputSchema.safeParse({
      subjectId: 2,
      requiresSubjectId: 1,
      requiredLevel: 'regularizada'
    })

    expect(parsed.success).toBe(true)
  })

  // STABLE MACHINE KEY, not prose — this module is shared with main and stays
  // framework-free (see the note at the top of shared/ipc/materias.ts).
  it('rejects a level outside the closed set with a stable key', () => {
    const parsed = addPrerequisiteInputSchema.safeParse({
      subjectId: 2,
      requiresSubjectId: 1,
      requiredLevel: 'cursada'
    })

    expect(parsed.success).toBe(false)
    expect(messagesOf(parsed)).toContain('requiredLevel.invalid')
  })

  // A materia cannot be its own correlativa. Caught HERE rather than by the
  // cycle guard so the mistake gets the message it deserves.
  it('rejects a subject requiring itself with its own key', () => {
    const parsed = addPrerequisiteInputSchema.safeParse({
      subjectId: 7,
      requiresSubjectId: 7,
      requiredLevel: 'aprobada'
    })

    expect(parsed.success).toBe(false)
    expect(messagesOf(parsed)).toContain('prerequisite.selfReference')
  })

  it('rejects non-positive ids', () => {
    expect(
      addPrerequisiteInputSchema.safeParse({ subjectId: 0, requiresSubjectId: 1, requiredLevel: 'aprobada' }).success
    ).toBe(false)
    expect(
      addPrerequisiteInputSchema.safeParse({ subjectId: 1, requiresSubjectId: -3, requiredLevel: 'aprobada' }).success
    ).toBe(false)
  })
})

describe('updatePrerequisiteInputSchema', () => {
  it('accepts a level change', () => {
    expect(updatePrerequisiteInputSchema.safeParse({ id: 4, requiredLevel: 'regularizada' }).success).toBe(true)
  })

  // The level is the ONLY editable field: re-pointing an edge at a different
  // materia is a delete plus an add, and only the add can be cycle-checked.
  it('ignores any attempt to re-point the edge', () => {
    const parsed = updatePrerequisiteInputSchema.safeParse({
      id: 4,
      requiredLevel: 'aprobada',
      requiresSubjectId: 99
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({ id: 4, requiredLevel: 'aprobada' })
  })

  it('rejects an unknown level with the same stable key', () => {
    const parsed = updatePrerequisiteInputSchema.safeParse({ id: 4, requiredLevel: 'promocionada' })

    expect(messagesOf(parsed)).toContain('requiredLevel.invalid')
  })
})

describe('prerequisiteIdInputSchema', () => {
  it('accepts a positive id', () => {
    expect(prerequisiteIdInputSchema.safeParse({ id: 12 }).success).toBe(true)
  })

  it('rejects a missing id', () => {
    expect(prerequisiteIdInputSchema.safeParse({}).success).toBe(false)
  })
})

describe('plannerEntryInputSchema', () => {
  // A draft line is the PAIR — the same shape both the add and the remove
  // command address, exactly as `clases`' two clear commands share one.
  it('accepts a period/subject pair', () => {
    expect(plannerEntryInputSchema.safeParse({ periodId: 3, subjectId: 8 }).success).toBe(true)
  })

  it('rejects a draft line with no period', () => {
    expect(plannerEntryInputSchema.safeParse({ subjectId: 8 }).success).toBe(false)
  })

  it('rejects a non-integer id', () => {
    expect(plannerEntryInputSchema.safeParse({ periodId: 3.5, subjectId: 8 }).success).toBe(false)
  })
})
