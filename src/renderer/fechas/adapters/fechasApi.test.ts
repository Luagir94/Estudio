import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AcademicDateWithProgram } from '../../../shared/ipc/fechas'
import { FechasApiError, fechasApi } from './fechasApi'

const sampleDate: AcademicDateWithProgram = {
  id: 1,
  programId: 2,
  title: 'Inscripción a finales — Diciembre',
  kind: 'inscripcionFinales',
  startsOn: '2026-12-01',
  endsOn: '2026-12-05',
  programName: 'Abogacía'
}

const fechas = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn()
}

describe('fechasApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { api: { fechas } })
  })

  it('list parses the dates it receives', async () => {
    fechas.list.mockResolvedValue({ ok: true, data: [sampleDate] })

    await expect(fechasApi.list()).resolves.toEqual([sampleDate])
  })

  it('list keeps a single-day date null end', async () => {
    fechas.list.mockResolvedValue({ ok: true, data: [{ ...sampleDate, endsOn: null }] })

    const [date] = await fechasApi.list()

    expect(date!.endsOn).toBeNull()
  })

  it('list rejects a payload whose kind is outside the closed set', async () => {
    fechas.list.mockResolvedValue({ ok: true, data: [{ ...sampleDate, kind: 'mudanza' }] })

    await expect(fechasApi.list()).rejects.toThrow()
  })

  it('throws a FechasApiError carrying the envelope code', async () => {
    fechas.list.mockResolvedValue({ ok: false, error: { code: 'LIST_FAILED', message: 'database is locked' } })

    const error: unknown = await fechasApi.list().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(FechasApiError)
    expect((error as FechasApiError).code).toBe('LIST_FAILED')
    expect((error as Error).message).toBe('database is locked')
  })

  it('create forwards the input and parses the created date', async () => {
    const input = {
      programId: 2,
      title: 'Inscripción a finales — Diciembre',
      kind: 'inscripcionFinales' as const,
      startsOn: '2026-12-01',
      endsOn: '2026-12-05'
    }
    fechas.create.mockResolvedValue({ ok: true, data: { ...input, id: 9 } })

    await expect(fechasApi.create(input)).resolves.toMatchObject({ id: 9 })
    expect(fechas.create).toHaveBeenCalledWith(input)
  })

  it('update forwards the corrected fields and parses the saved date', async () => {
    const input = {
      id: 1,
      title: 'Inscripción a finales',
      kind: 'otro' as const,
      startsOn: '2026-12-02',
      endsOn: null
    }
    fechas.update.mockResolvedValue({ ok: true, data: { ...input, programId: 2 } })

    await expect(fechasApi.update(input)).resolves.toMatchObject({ id: 1, endsOn: null })
    expect(fechas.update).toHaveBeenCalledWith(input)
  })

  it('delete parses the deleted id', async () => {
    fechas.delete.mockResolvedValue({ ok: true, data: { id: 1 } })

    await expect(fechasApi.delete(1)).resolves.toEqual({ id: 1 })
    expect(fechas.delete).toHaveBeenCalledWith(1)
  })
})
