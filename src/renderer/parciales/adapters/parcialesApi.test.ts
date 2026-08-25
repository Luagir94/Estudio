// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PartialExamRecord } from '../../../shared/ipc/materias'
import { ParcialesApiError, parcialesApi } from './parcialesApi'

const sampleParcial: PartialExamRecord = {
  id: 1,
  subjectId: 1,
  label: '1er parcial',
  takenOn: '2026-05-12',
  result: 'aprobado',
  grade: 8
}

describe('parcialesApi', () => {
  beforeEach(() => {
    // @ts-expect-error test-only global stub
    window.api = {
      parciales: {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    }
  })

  it('create parses and returns the created parcial on success', async () => {
    vi.mocked(window.api.parciales.create).mockResolvedValue({ ok: true, data: sampleParcial })

    const result = await parcialesApi.create({
      subjectId: 1,
      label: '1er parcial',
      takenOn: '2026-05-12',
      result: 'aprobado',
      grade: 8
    })

    expect(result).toEqual(sampleParcial)
  })

  // The renderer maps its Spanish copy off the CODE, never `message`
  // (`shared/lib/ipcErrorCopy.ts`) — so the throw must carry it.
  it('create throws a ParcialesApiError carrying the envelope code', async () => {
    vi.mocked(window.api.parciales.create).mockResolvedValue({
      ok: false,
      error: { code: 'CREATE_FAILED', message: 'a pass/fail program does not carry grades' }
    })

    const error: unknown = await parcialesApi
      .create({ subjectId: 1, label: '1er parcial', takenOn: null, result: 'pendiente', grade: 8 })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ParcialesApiError)
    expect((error as ParcialesApiError).code).toBe('CREATE_FAILED')
    expect((error as Error).message).toBe('a pass/fail program does not carry grades')
  })

  it('update parses and returns the corrected parcial', async () => {
    vi.mocked(window.api.parciales.update).mockResolvedValue({
      ok: true,
      data: { ...sampleParcial, result: 'reprobado', grade: 3 }
    })

    const result = await parcialesApi.update({
      id: 1,
      label: '1er parcial',
      takenOn: '2026-05-12',
      result: 'reprobado',
      grade: 3
    })

    expect(result).toMatchObject({ result: 'reprobado', grade: 3 })
  })

  it('delete parses and returns the deleted id', async () => {
    vi.mocked(window.api.parciales.delete).mockResolvedValue({ ok: true, data: { id: 1 } })

    expect(await parcialesApi.delete(1)).toEqual({ id: 1 })
  })

  it('delete throws a ParcialesApiError carrying the envelope code', async () => {
    vi.mocked(window.api.parciales.delete).mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'No partial exam with id 1' }
    })

    const error: unknown = await parcialesApi.delete(1).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ParcialesApiError)
    expect((error as ParcialesApiError).code).toBe('NOT_FOUND')
  })
})
