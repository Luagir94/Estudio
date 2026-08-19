import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import type { ProgramRepository } from '../adapters/sqliteProgramRepository'

const { ipcMainMock } = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
  return {
    ipcMainMock: {
      handlers,
      handle: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener)
      })
    }
  }
})

vi.mock('electron', () => ({ ipcMain: ipcMainMock }))

import { registerCarrerasHandlers } from './registerCarrerasHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const sampleProgram: ProgramWithPeriods = {
  id: 1,
  name: 'Abogacía',
  institution: 'Universidad de Buenos Aires',
  color: '#4C8DFF',
  gradingScheme: 'numerico',
  gradeScale: 10,
  periods: [],
  subjectCount: 0,
  gradedSubjects: []
}

const validProgram = {
  name: 'Abogacía',
  institution: 'Universidad de Buenos Aires',
  color: '#4C8DFF',
  gradingScheme: 'numerico',
  gradeScale: 10
}

describe('registerCarrerasHandlers', () => {
  let repository: ProgramRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    repository = {
      create: vi.fn().mockReturnValue(sampleProgram),
      list: vi.fn().mockReturnValue([sampleProgram]),
      detail: vi.fn().mockReturnValue(sampleProgram),
      update: vi.fn().mockReturnValue(sampleProgram),
      createPeriod: vi.fn().mockReturnValue({
        id: 7,
        programId: 1,
        name: 'Clases',
        kind: 'clases',
        startsOn: '2024-03-04',
        endsOn: null
      }),
      updatePeriod: vi.fn().mockReturnValue({
        id: 7,
        programId: 1,
        name: '1er Cuatrimestre 2026',
        kind: 'cuatrimestre',
        startsOn: '2026-03-09',
        endsOn: '2026-07-04'
      }),
      removePeriod: vi.fn().mockReturnValue({ id: 7, unlinkedSubjects: 2 }),
      remove: vi.fn().mockReturnValue({ id: 1, deletedPeriods: 2, unlinkedSubjects: 3 })
    }
    registerCarrerasHandlers(repository)
  })

  it('registers every carreras channel', () => {
    expect([...ipcMainMock.handlers.keys()].sort()).toEqual([
      'carreras:create',
      'carreras:createPeriod',
      'carreras:delete',
      'carreras:deletePeriod',
      'carreras:detail',
      'carreras:list',
      'carreras:update',
      'carreras:updatePeriod'
    ])
  })

  describe('carreras:update', () => {
    it('corrects the program and returns it', () => {
      const result = invoke('carreras:update', { ...validProgram, id: 1 })

      expect(repository.update).toHaveBeenCalledWith({ ...validProgram, id: 1 })
      expect(result).toEqual({ ok: true, data: sampleProgram })
    })

    it('rejects a payload with no id', () => {
      const result = invoke('carreras:update', validProgram)

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(repository.update).not.toHaveBeenCalled()
    })

    // Same consistency rule the create command enforces — the two commands
    // share one field schema so neither can accept what the other rejects.
    it('rejects a numeric program with no scale', () => {
      const result = invoke('carreras:update', { ...validProgram, id: 1, gradeScale: null })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(repository.update).not.toHaveBeenCalled()
    })

    it('rejects a pass/fail program that still carries a scale', () => {
      const result = invoke('carreras:update', { ...validProgram, id: 1, gradingScheme: 'binario' })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(repository.update).not.toHaveBeenCalled()
    })

    // A carrera CAN legitimately change scheme while nothing is graded yet;
    // the transport must not be the thing that forbids it.
    it('accepts a move to pass/fail with the scale dropped', () => {
      const result = invoke('carreras:update', {
        ...validProgram,
        id: 1,
        gradingScheme: 'binario',
        gradeScale: null
      })

      expect(result).toMatchObject({ ok: true })
    })

    it('reports a program that is not there', () => {
      repository.update = vi.fn().mockReturnValue(null)
      registerCarrerasHandlers(repository)

      const result = invoke('carreras:update', { ...validProgram, id: 99 })

      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })
  })

  it('create passes a validated program to the repository', () => {
    const result = invoke('carreras:create', validProgram)

    expect(result).toEqual({ ok: true, data: sampleProgram })
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ gradeScale: 10 }))
  })

  it('create rejects a numeric program with no scale', () => {
    const result = invoke('carreras:create', { ...validProgram, gradeScale: null })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('create rejects a pass/fail program carrying a scale', () => {
    const result = invoke('carreras:create', {
      ...validProgram,
      gradingScheme: 'binario',
      gradeScale: 10
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  })

  it('create rejects an unknown grading scheme', () => {
    const result = invoke('carreras:create', { ...validProgram, gradingScheme: 'estrellas' })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  })

  it('create reports a repository failure without throwing', () => {
    vi.mocked(repository.create).mockImplementation(() => {
      throw new Error('disk on fire')
    })

    expect(invoke('carreras:create', validProgram)).toEqual({
      ok: false,
      error: { code: 'CREATE_FAILED', message: 'disk on fire' }
    })
  })

  it('list returns every program', () => {
    expect(invoke('carreras:list')).toEqual({ ok: true, data: [sampleProgram] })
  })

  it('detail reports NOT_FOUND for an unknown program', () => {
    vi.mocked(repository.detail).mockReturnValue(null)

    expect(invoke('carreras:detail', { id: 99 })).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'No program with id 99' }
    })
  })

  it('createPeriod accepts an open-ended period', () => {
    const result = invoke('carreras:createPeriod', {
      programId: 1,
      name: 'Curso',
      kind: 'curso',
      startsOn: '2024-03-04',
      endsOn: null
    })

    expect(result).toMatchObject({ ok: true, data: { endsOn: null } })
  })

  it('createPeriod treats a missing end date as open-ended', () => {
    invoke('carreras:createPeriod', {
      programId: 1,
      name: 'Curso',
      kind: 'curso',
      startsOn: '2024-03-04'
    })

    expect(repository.createPeriod).toHaveBeenCalledWith(expect.objectContaining({ endsOn: null }))
  })

  it('createPeriod rejects an end date before the start', () => {
    const result = invoke('carreras:createPeriod', {
      programId: 1,
      name: '1er 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-03-08'
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(repository.createPeriod).not.toHaveBeenCalled()
  })

  it('createPeriod rejects a date that carries a time', () => {
    const result = invoke('carreras:createPeriod', {
      programId: 1,
      name: '1er 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09T08:00',
      endsOn: null
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  })

  // The kind is a CLOSED catalogue on the write side (shared/ipc/carreras.ts's
  // periodKindSchema). Free text is what let one carrera hold "ddd", "2do
  // cuatri" and "cuatrimestre" at once, and the contract is where that stops —
  // not just the form, which a stale renderer could bypass.
  it('createPeriod rejects a kind that is not in the catalogue', () => {
    const result = invoke('carreras:createPeriod', {
      programId: 1,
      name: '1er cuatrimestre',
      kind: 'ddd',
      startsOn: '2026-03-09',
      endsOn: '2026-07-04'
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(repository.createPeriod).not.toHaveBeenCalled()
  })

  it('updatePeriod passes the corrected fields to the repository', () => {
    const result = invoke('carreras:updatePeriod', {
      id: 7,
      name: '1er Cuatrimestre 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-04'
    })

    expect(result).toMatchObject({ ok: true, data: { id: 7 } })
    expect(repository.updatePeriod).toHaveBeenCalledWith(expect.objectContaining({ id: 7, startsOn: '2026-03-09' }))
  })

  it('updatePeriod ignores a programId — a period does not change carrera', () => {
    invoke('carreras:updatePeriod', {
      id: 7,
      programId: 99,
      name: '1er Cuatrimestre 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-04'
    })

    expect(repository.updatePeriod).toHaveBeenCalledWith(expect.not.objectContaining({ programId: 99 }))
  })

  it('updatePeriod accepts clearing the end date', () => {
    invoke('carreras:updatePeriod', {
      id: 7,
      name: 'Curso',
      kind: 'curso',
      startsOn: '2026-03-09',
      endsOn: null
    })

    expect(repository.updatePeriod).toHaveBeenCalledWith(expect.objectContaining({ endsOn: null }))
  })

  it('updatePeriod rejects an end date before the start', () => {
    const result = invoke('carreras:updatePeriod', {
      id: 7,
      name: '1er Cuatrimestre 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-03-08'
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(repository.updatePeriod).not.toHaveBeenCalled()
  })

  it('updatePeriod reports NOT_FOUND for an unknown period', () => {
    vi.mocked(repository.updatePeriod).mockReturnValue(null)

    expect(
      invoke('carreras:updatePeriod', {
        id: 99,
        name: '1er Cuatrimestre 2026',
        kind: 'cuatrimestre',
        startsOn: '2026-03-09',
        endsOn: '2026-07-04'
      })
    ).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'No period with id 99' } })
  })

  it('deletePeriod reports the subjects left without a period', () => {
    expect(invoke('carreras:deletePeriod', { id: 7 })).toEqual({
      ok: true,
      data: { id: 7, unlinkedSubjects: 2 }
    })
  })

  it('deletePeriod reports NOT_FOUND for an unknown period', () => {
    vi.mocked(repository.removePeriod).mockReturnValue(null)

    expect(invoke('carreras:deletePeriod', { id: 99 })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' }
    })
  })

  it('delete reports what the cascade touched', () => {
    expect(invoke('carreras:delete', { id: 1 })).toEqual({
      ok: true,
      data: { id: 1, deletedPeriods: 2, unlinkedSubjects: 3 }
    })
  })

  it('delete reports NOT_FOUND for an unknown program', () => {
    vi.mocked(repository.remove).mockReturnValue(null)

    expect(invoke('carreras:delete', { id: 99 })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' }
    })
  })
})
