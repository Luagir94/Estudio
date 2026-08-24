import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import { CarrerasApiError, carrerasApi } from './carrerasApi'

const sampleProgram: ProgramWithPeriods = {
  id: 1,
  name: 'Abogacía',
  institution: 'Universidad de Buenos Aires',
  color: '#4C8DFF',
  gradingScheme: 'numerico',
  gradeScale: 10,
  periods: [
    { id: 3, programId: 1, name: '1er 2026', kind: 'cuatrimestre', startsOn: '2026-03-09', endsOn: '2026-07-18' }
  ],
  subjectCount: 1,
  gradedSubjects: [{ grade: 8, outcome: 'aprobada', hasApprovedFinal: false }]
}

const carreras = {
  create: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  update: vi.fn(),
  createPeriod: vi.fn(),
  updatePeriod: vi.fn(),
  deletePeriod: vi.fn(),
  delete: vi.fn()
}

describe('carrerasApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { api: { carreras } })
  })

  it('list parses the programs it receives', async () => {
    carreras.list.mockResolvedValue({ ok: true, data: [sampleProgram] })

    await expect(carrerasApi.list()).resolves.toEqual([sampleProgram])
  })

  it('list keeps an open-ended period null end date', async () => {
    const openEnded = {
      ...sampleProgram,
      periods: [{ id: 4, programId: 1, name: 'Clases', kind: 'clases', startsOn: '2024-03-04', endsOn: null }]
    }
    carreras.list.mockResolvedValue({ ok: true, data: [openEnded] })

    const [program] = await carrerasApi.list()

    expect(program!.periods[0]!.endsOn).toBeNull()
  })

  it('list rejects a payload that does not match the contract', async () => {
    carreras.list.mockResolvedValue({
      ok: true,
      data: [{ ...sampleProgram, gradingScheme: 'estrellas' }]
    })

    await expect(carrerasApi.list()).rejects.toThrow()
  })

  it('surfaces an error envelope as a thrown error', async () => {
    carreras.list.mockResolvedValue({ ok: false, error: { code: 'LIST_FAILED', message: 'boom' } })

    await expect(carrerasApi.list()).rejects.toThrow('boom')
  })

  // The renderer maps its Spanish copy off the CODE, never `message`
  // (`shared/lib/ipcErrorCopy.ts`) — so the throw must carry it, exactly
  // like `AdjuntosApiError`/`AjustesApiError`.
  it('throws a CarrerasApiError carrying the envelope code', async () => {
    carreras.list.mockResolvedValue({ ok: false, error: { code: 'LIST_FAILED', message: 'database is locked' } })

    const error: unknown = await carrerasApi.list().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CarrerasApiError)
    expect((error as CarrerasApiError).code).toBe('LIST_FAILED')
    expect((error as Error).message).toBe('database is locked')
  })

  it('create forwards the input and parses the created program', async () => {
    const input = {
      name: 'Abogacía',
      institution: null,
      color: '#4C8DFF',
      gradingScheme: 'numerico' as const,
      gradeScale: 10
    }
    carreras.create.mockResolvedValue({ ok: true, data: { ...input, id: 1 } })

    await expect(carrerasApi.create(input)).resolves.toMatchObject({ id: 1, gradeScale: 10 })
    expect(carreras.create).toHaveBeenCalledWith(input)
  })

  it('createPeriod forwards the input and parses the created period', async () => {
    const input = {
      programId: 1,
      name: 'Curso',
      kind: 'curso' as const,
      startsOn: '2024-03-04',
      endsOn: null
    }
    carreras.createPeriod.mockResolvedValue({ ok: true, data: { ...input, id: 9 } })

    await expect(carrerasApi.createPeriod(input)).resolves.toMatchObject({ id: 9, endsOn: null })
  })

  it('updatePeriod forwards the corrected fields and parses the saved period', async () => {
    const input = {
      id: 3,
      name: '1er cuatrimestre',
      kind: 'cuatrimestre' as const,
      startsOn: '2026-03-09',
      endsOn: '2026-07-04'
    }
    carreras.updatePeriod.mockResolvedValue({ ok: true, data: { ...input, programId: 1 } })

    await expect(carrerasApi.updatePeriod(input)).resolves.toMatchObject({ id: 3, endsOn: '2026-07-04' })
    expect(carreras.updatePeriod).toHaveBeenCalledWith(input)
  })

  it('updatePeriod surfaces an error envelope as a thrown error', async () => {
    carreras.updatePeriod.mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: 'No period with id 3' } })

    await expect(
      carrerasApi.updatePeriod({ id: 3, name: 'X', kind: 'cuatrimestre', startsOn: '2026-03-09', endsOn: null })
    ).rejects.toThrow('No period with id 3')
  })

  it('deletePeriod parses the count of subjects left unassigned', async () => {
    carreras.deletePeriod.mockResolvedValue({ ok: true, data: { id: 3, unlinkedSubjects: 2 } })

    await expect(carrerasApi.deletePeriod(3)).resolves.toEqual({ id: 3, unlinkedSubjects: 2 })
    expect(carreras.deletePeriod).toHaveBeenCalledWith(3)
  })

  it('detail parses a single program', async () => {
    carreras.detail.mockResolvedValue({ ok: true, data: sampleProgram })

    await expect(carrerasApi.detail(1)).resolves.toEqual(sampleProgram)
    expect(carreras.detail).toHaveBeenCalledWith(1)
  })

  it('delete parses the cascade report', async () => {
    carreras.delete.mockResolvedValue({
      ok: true,
      data: { id: 1, deletedPeriods: 2, unlinkedSubjects: 3 }
    })

    await expect(carrerasApi.delete(1)).resolves.toEqual({
      id: 1,
      deletedPeriods: 2,
      unlinkedSubjects: 3
    })
  })
})

describe('carrerasApi.update', () => {
  const input = {
    id: 1,
    name: 'Abogacía (UBA)',
    institution: 'UBA',
    color: '#A78BFA',
    gradingScheme: 'numerico' as const,
    gradeScale: 10
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { api: { carreras } })
  })

  it('parses the corrected program it receives back', async () => {
    carreras.update.mockResolvedValue({ ok: true, data: { ...input } })

    await expect(carrerasApi.update(input)).resolves.toEqual(input)
  })

  it('throws the reported reason instead of returning a broken program', async () => {
    carreras.update.mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: 'No program with id 1' } })

    await expect(carrerasApi.update(input)).rejects.toThrow('No program with id 1')
  })
})
