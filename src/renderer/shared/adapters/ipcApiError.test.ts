import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { IpcResult } from '../../../shared/ipc/materias'
import { describeIpcError, describeIpcErrorCode } from '../lib/ipcErrorCopy'
import { IpcApiError, assertIpcOk, unwrapIpcResult } from './ipcApiError'

// Stand-in for a feature's own error class (`EntregasApiError`, ...): the
// subclass keeps its `instanceof` identity while the base carries `code`.
class FakeFeatureApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'FakeFeatureApiError'
  }
}

const recordSchema = z.object({ id: z.number() })

describe('unwrapIpcResult', () => {
  it('parses and returns the data on an ok envelope', () => {
    const result: IpcResult<unknown> = { ok: true, data: { id: 7 } }

    expect(unwrapIpcResult(result, recordSchema, FakeFeatureApiError)).toEqual({ id: 7 })
  })

  it('rejects an ok payload that does not match the contract', () => {
    const result: IpcResult<unknown> = { ok: true, data: { id: 'not-a-number' } }

    // A malformed SUCCESS payload is an app bug, not an IPC failure — it must
    // surface as the schema's own error, never dressed up as an ApiError.
    expect(() => unwrapIpcResult(result, recordSchema, FakeFeatureApiError)).toThrowError(z.ZodError)
  })

  it('throws the feature error class carrying the envelope code and message', () => {
    const result: IpcResult<unknown> = { ok: false, error: { code: 'NOT_FOUND', message: 'No record with id 7' } }

    const error: unknown = (() => {
      try {
        unwrapIpcResult(result, recordSchema, FakeFeatureApiError)
        return undefined
      } catch (caught) {
        return caught
      }
    })()

    expect(error).toBeInstanceOf(FakeFeatureApiError)
    expect(error).toBeInstanceOf(IpcApiError)
    expect((error as IpcApiError).code).toBe('NOT_FOUND')
    expect((error as Error).message).toBe('No record with id 7')
  })

  // The reason the code must survive the throw at all: the renderer maps its
  // Spanish copy off the CODE (`shared/lib/ipcErrorCopy.ts`), never `message`.
  it('throws an error describeIpcError classifies by its code', () => {
    const result: IpcResult<unknown> = { ok: false, error: { code: 'NOT_FOUND', message: 'database is locked' } }

    try {
      unwrapIpcResult(result, recordSchema, FakeFeatureApiError)
      expect.unreachable('unwrapIpcResult must throw on an error envelope')
    } catch (caught) {
      expect(describeIpcError(caught)).toBe(describeIpcErrorCode('NOT_FOUND'))
    }
  })
})

describe('assertIpcOk', () => {
  it('returns without throwing on an ok envelope', () => {
    const result: IpcResult<unknown> = { ok: true, data: undefined }

    expect(() => assertIpcOk(result, FakeFeatureApiError)).not.toThrow()
  })

  it('throws the feature error class carrying the envelope code', () => {
    const result: IpcResult<unknown> = { ok: false, error: { code: 'URL_REFUSED', message: 'Only https' } }

    const error: unknown = (() => {
      try {
        assertIpcOk(result, FakeFeatureApiError)
        return undefined
      } catch (caught) {
        return caught
      }
    })()

    expect(error).toBeInstanceOf(FakeFeatureApiError)
    expect((error as IpcApiError).code).toBe('URL_REFUSED')
  })
})
