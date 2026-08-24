import { describe, expect, it } from 'vitest'
import {
  describeIpcError,
  describeIpcErrorCode,
  GENERIC_IPC_ERROR_MESSAGE,
  type KnownIpcErrorCode
} from './ipcErrorCopy'

// Every code found across `ipcErr(...)` call sites in `src/main` (grepped
// 2026-08-23) — see the audit comment atop `ipcErrorCopy.ts`. This list is
// the actual inventory, not the ~24 estimate from the audit that kicked off
// this phase: it includes `ATTACHMENT_NOT_FOUND`/`NOT_MARKDOWN` (attachment
// service pass-through codes) and excludes nothing that was found.
const ALL_KNOWN_CODES: readonly KnownIpcErrorCode[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CREATE_FAILED',
  'LIST_FAILED',
  'DETAIL_FAILED',
  'UPDATE_FAILED',
  'DELETE_FAILED',
  'OUTCOME_FAILED',
  'ADD_FAILED',
  'OPEN_FAILED',
  'ATTACHMENT_FILE_MISSING',
  'READ_FAILED',
  'WRITE_FAILED',
  'DASHBOARD_FAILED',
  'URL_REFUSED',
  'EXPORT_FAILED',
  'WEEK_FAILED',
  'PROBE_FAILED',
  'PREFERENCES_READ_FAILED',
  'DISCONNECT_FAILED',
  'SET_OVERRIDE_FAILED',
  'CREATE_PERIOD_FAILED',
  'UPDATE_PERIOD_FAILED',
  'DELETE_PERIOD_FAILED',
  'SETDONE_FAILED',
  'SYNC_FAILED',
  'EXECUTION_FAILED',
  'ATTACHMENT_NOT_FOUND',
  'NOT_MARKDOWN',
  'FILE_TOO_LARGE'
]

describe('describeIpcErrorCode', () => {
  it.each(ALL_KNOWN_CODES)('maps %s to its own non-empty Spanish copy, distinct from the generic fallback', (code) => {
    const copy = describeIpcErrorCode(code)

    expect(copy.length).toBeGreaterThan(0)
    expect(copy).not.toBe(GENERIC_IPC_ERROR_MESSAGE)
  })

  // The whole point: neither the raw message nor the bare code may ever
  // reach the screen for a code this map has not been taught.
  it('falls back to the generic message for an unrecognized code', () => {
    expect(describeIpcErrorCode('SOME_FUTURE_CODE')).toBe(GENERIC_IPC_ERROR_MESSAGE)
  })

  it('falls back to the generic message for undefined/null', () => {
    expect(describeIpcErrorCode(undefined)).toBe(GENERIC_IPC_ERROR_MESSAGE)
    expect(describeIpcErrorCode(null)).toBe(GENERIC_IPC_ERROR_MESSAGE)
  })

  it('never echoes the code itself as copy', () => {
    for (const code of ALL_KNOWN_CODES) {
      expect(describeIpcErrorCode(code)).not.toBe(code)
    }
  })
})

describe('describeIpcError', () => {
  it('returns undefined when there is no error', () => {
    expect(describeIpcError(null)).toBeUndefined()
    expect(describeIpcError(undefined)).toBeUndefined()
  })

  it('maps a coded error (duck-typed, not a specific class) to its copy', () => {
    class SomeDomainApiError extends Error {
      code: string
      constructor(code: string, message: string) {
        super(message)
        this.code = code
      }
    }

    expect(describeIpcError(new SomeDomainApiError('NOT_FOUND', 'No period with id 3'))).toBe(
      describeIpcErrorCode('NOT_FOUND')
    )
  })

  // The exact bug this whole module exists to close: a plain `Error` (e.g. a
  // Zod response-parse failure, or a rejected adapter call with no `code`)
  // must resolve to the generic message, never to its own raw `.message`.
  it('falls back to the generic message for a plain Error with no code', () => {
    expect(describeIpcError(new Error('Unknown error'))).toBe(GENERIC_IPC_ERROR_MESSAGE)
  })
})
