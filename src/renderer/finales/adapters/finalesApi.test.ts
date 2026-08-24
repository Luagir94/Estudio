// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinalExamRecord } from '../../../shared/ipc/materias'
import { FinalesApiError, finalesApi } from './finalesApi'

const sampleFinal: FinalExamRecord = {
  id: 1,
  subjectId: 1,
  label: 'Primera mesa',
  takenOn: '2026-12-10',
  result: 'aprobado'
}

describe('finalesApi', () => {
  beforeEach(() => {
    // @ts-expect-error test-only global stub
    window.api = {
      finales: {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    }
  })

  it('create parses and returns the created final on success', async () => {
    vi.mocked(window.api.finales.create).mockResolvedValue({ ok: true, data: sampleFinal })

    const result = await finalesApi.create({
      subjectId: 1,
      label: 'Primera mesa',
      takenOn: '2026-12-10',
      result: 'aprobado'
    })

    expect(result).toEqual(sampleFinal)
  })

  it('create throws when the envelope reports ok: false', async () => {
    vi.mocked(window.api.finales.create).mockResolvedValue({
      ok: false,
      error: { code: 'CREATE_FAILED', message: 'database is locked' }
    })

    await expect(
      finalesApi.create({ subjectId: 1, label: 'Primera mesa', takenOn: null, result: 'pendiente' })
    ).rejects.toThrow('database is locked')
  })

  // The renderer maps its Spanish copy off the CODE, never `message`
  // (`shared/lib/ipcErrorCopy.ts`) — so the throw must carry it, exactly
  // like `CarrerasApiError`/`AdjuntosApiError`.
  it('create throws a FinalesApiError carrying the envelope code', async () => {
    vi.mocked(window.api.finales.create).mockResolvedValue({
      ok: false,
      error: { code: 'CREATE_FAILED', message: 'database is locked' }
    })

    const error: unknown = await finalesApi
      .create({ subjectId: 1, label: 'Primera mesa', takenOn: null, result: 'pendiente' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(FinalesApiError)
    expect((error as FinalesApiError).code).toBe('CREATE_FAILED')
    expect((error as Error).message).toBe('database is locked')
  })

  it('update parses and returns the corrected final', async () => {
    vi.mocked(window.api.finales.update).mockResolvedValue({ ok: true, data: { ...sampleFinal, result: 'reprobado' } })

    const result = await finalesApi.update({ id: 1, label: 'Primera mesa', takenOn: '2026-12-10', result: 'reprobado' })

    expect(result.result).toBe('reprobado')
  })

  it('delete parses and returns the deleted id', async () => {
    vi.mocked(window.api.finales.delete).mockResolvedValue({ ok: true, data: { id: 1 } })

    const result = await finalesApi.delete(1)

    expect(result).toEqual({ id: 1 })
  })

  it('delete throws a FinalesApiError carrying the envelope code', async () => {
    vi.mocked(window.api.finales.delete).mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'No final exam with id 1' }
    })

    const error: unknown = await finalesApi.delete(1).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(FinalesApiError)
    expect((error as FinalesApiError).code).toBe('NOT_FOUND')
  })
})
