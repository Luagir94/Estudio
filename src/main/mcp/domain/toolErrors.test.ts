import { describe, expect, it } from 'vitest'
import {
  invalidInputError,
  notFoundError,
  permissionDeniedError,
  sessionTerminatedError,
  toolFailedError
} from './toolErrors'

// Two guarantees live here. The first is that a client-facing error says what
// to DO next, not just what went wrong — an agent that reads
// `PERMISSION_DENIED` alone has nowhere to go. The second is that no internal
// failure text ever reaches the wire: `toolFailedError` takes the tool name
// and nothing else, the same way `authFailedSummary` takes a closed-set
// reason and never a token.

describe('permissionDeniedError', () => {
  it('names the slice and action the caller needs, and where a human grants it', () => {
    const error = permissionDeniedError('materias', 'write')

    expect(error.code).toBe('PERMISSION_DENIED')
    expect(error.message).toContain('materias')
    expect(error.message).toContain('write')
    expect(error.message).toContain('Permisos')
  })

  it('says the grant applies without reconnecting, because it does', () => {
    // `mcpService.authorize` reads the matrix fresh on every call, so telling
    // a client to reconnect here would send it through a handshake it does
    // not need.
    expect(permissionDeniedError('clases', 'read').message).toMatch(/next call|no reconnect/i)
  })

  it('distinguishes read from write for the same slice', () => {
    expect(permissionDeniedError('fechas', 'read').message).not.toEqual(
      permissionDeniedError('fechas', 'write').message
    )
  })
})

describe('sessionTerminatedError', () => {
  it('explains that the token changed and that a reconnect is the way out', () => {
    const error = sessionTerminatedError()

    expect(error.code).toBe('SESSION_TERMINATED')
    expect(error.message).toMatch(/rotat|revok/i)
    expect(error.message).toMatch(/reconnect/i)
  })
})

describe('notFoundError', () => {
  it('points the caller at the tool that would give it a valid id', () => {
    const error = notFoundError('materias_detail')

    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toContain('materias_detail')
    expect(error.message).toMatch(/list/i)
  })
})

describe('toolFailedError', () => {
  it('identifies the tool and points at the app-side record of the failure', () => {
    const error = toolFailedError('materias_create')

    expect(error.code).toBe('TOOL_FAILED')
    expect(error.message).toContain('materias_create')
    expect(error.message).toContain('Actividad')
  })

  it('cannot carry internal failure text, because it never receives any', () => {
    // The structural guarantee: whatever the repository threw, the message a
    // client sees is a function of the tool name alone. A future caller
    // CANNOT widen this without changing the signature here first.
    const fromOneFailure = toolFailedError('materias_create')
    const fromAnother = toolFailedError('materias_create')

    expect(fromOneFailure).toEqual(fromAnother)
    expect(JSON.stringify(fromOneFailure)).not.toMatch(/sqlite|constraint|SQL|stack/i)
  })
})

describe('invalidInputError', () => {
  it('passes the input contract’s own code and message through: they describe the CALLER’s payload, not our internals', () => {
    const error = invalidInputError('VALIDATION_FAILED', 'endsOn.beforeStart')

    expect(error).toEqual({ code: 'VALIDATION_FAILED', message: 'endsOn.beforeStart' })
  })

  it('falls back to the code when the contract carried no message', () => {
    expect(invalidInputError('VALIDATION_FAILED', undefined).message).toBe('VALIDATION_FAILED')
  })
})
