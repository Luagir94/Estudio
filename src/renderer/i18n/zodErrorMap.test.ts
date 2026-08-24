import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import './index'

// `./index`'s import above is what actually installs the map (it runs
// `installZodErrorMap()` at module load — see that file) — same module
// vitest.setup.ts already imports for every test file, so this schema sees
// the SAME global zod config every real form in the app sees.
//
// Mirrors the shape that motivated this: shared/ipc/materias.ts's
// scheduleSlotInputSchema has fields like `z.number().int().min(0).max(6)`
// with no explicit message.
describe('installZodErrorMap (renderer-only global Zod error map)', () => {
  const numberField = z.number().int().min(0).max(6)

  it('translates a built-in "too_big" default into Spanish', () => {
    const result = numberField.safeParse(9)

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected validation failure')
    expect(result.error.issues[0]?.message).toBe('Ese valor supera el máximo permitido')
  })

  it('translates a built-in "invalid_type" default into Spanish', () => {
    const result = numberField.safeParse('nope')

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected validation failure')
    expect(result.error.issues[0]?.message).toBe('Ese valor no es válido')
  })

  it('translates a built-in "invalid_value" (enum) default into Spanish', () => {
    const result = z.enum(['numerico', 'binario']).safeParse('nope')

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected validation failure')
    expect(result.error.issues[0]?.message).toBe('Elegí una opción válida')
  })

  it('never overrides a schema check that passes an explicit message', () => {
    const result = z.string().min(1, 'name.required').safeParse('')

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected validation failure')
    expect(result.error.issues[0]?.message).toBe('name.required')
  })
})
