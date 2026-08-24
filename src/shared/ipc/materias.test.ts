import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parsePayload } from './materias'

// Validation messages in the real schemas are stable machine keys, so the
// fixture mirrors that convention — the joined string below is pinned
// byte-for-byte because every IPC handler's VALIDATION_ERROR envelope is
// built from it.
const schema = z.object({
  id: z.number().int().positive('id.positive'),
  name: z.string().min(1, 'name.required')
})

describe('parsePayload', () => {
  it('returns the parsed data on success', () => {
    const result = parsePayload(schema, { id: 7, name: 'Mesa' })

    expect(result).toEqual({ ok: true, data: { id: 7, name: 'Mesa' } })
  })

  it('applies schema transforms — the handler must receive the PARSED payload, not the raw one', () => {
    const defaulting = z.object({ mode: z.string().default('auto') })

    const result = parsePayload(defaulting, {})

    expect(result).toEqual({ ok: true, data: { mode: 'auto' } })
  })

  it('maps a failure to the exact VALIDATION_ERROR envelope the handlers return today', () => {
    const result = parsePayload(schema, { id: -1, name: '' })

    expect(result).toEqual({
      ok: false,
      failure: {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'id.positive; name.required' }
      }
    })
  })

  it('joins a single issue without a trailing separator', () => {
    const result = parsePayload(schema, { id: 7, name: '' })

    expect(result).toEqual({
      ok: false,
      failure: { ok: false, error: { code: 'VALIDATION_ERROR', message: 'name.required' } }
    })
  })

  it('accepts an explicit error code for the failure envelope', () => {
    const result = parsePayload(schema, { id: -1, name: 'Mesa' }, 'CUSTOM_CODE')

    expect(result).toEqual({
      ok: false,
      failure: { ok: false, error: { code: 'CUSTOM_CODE', message: 'id.positive' } }
    })
  })
})
