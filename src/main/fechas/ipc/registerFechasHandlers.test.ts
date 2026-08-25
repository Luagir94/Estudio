import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AcademicDateRecord, AcademicDateWithProgram } from '../../../shared/ipc/fechas'
import type { AcademicDateRepository } from '../adapters/sqliteAcademicDateRepository'

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

const logErrorMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ ipcMain: ipcMainMock }))
vi.mock('electron-log', () => ({ default: { error: logErrorMock } }))

import { registerFechasHandlers } from './registerFechasHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const sampleDate: AcademicDateRecord = {
  id: 1,
  programId: 2,
  title: 'Inscripción a finales — Diciembre',
  kind: 'inscripcionFinales',
  startsOn: '2026-12-01',
  endsOn: '2026-12-05'
}

const sampleWithProgram: AcademicDateWithProgram = { ...sampleDate, programName: 'Abogacía' }

describe('registerFechasHandlers', () => {
  let repository: AcademicDateRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    repository = {
      create: vi.fn().mockReturnValue(sampleDate),
      list: vi.fn().mockReturnValue([sampleWithProgram]),
      listByProgram: vi.fn().mockReturnValue([sampleWithProgram]),
      update: vi.fn().mockReturnValue(sampleDate),
      remove: vi.fn().mockReturnValue(true)
    }
    registerFechasHandlers(repository)
  })

  it('registers exactly the four fechas:* channels', () => {
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(4)
    for (const channel of ['fechas:list', 'fechas:create', 'fechas:update', 'fechas:delete']) {
      expect(ipcMainMock.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  describe('fechas:list', () => {
    it('returns every date with its program name', () => {
      expect(invoke('fechas:list')).toEqual({ ok: true, data: [sampleWithProgram] })
    })

    it('returns LIST_FAILED when the repository throws', () => {
      repository.list = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerFechasHandlers(repository)

      expect(invoke('fechas:list')).toEqual({
        ok: false,
        error: { code: 'LIST_FAILED', message: 'database is locked' }
      })
      expect(logErrorMock).toHaveBeenCalledWith('fechas:list failed', expect.any(Error))
    })
  })

  describe('fechas:create', () => {
    it('parses a valid payload and returns the created date', () => {
      const result = invoke('fechas:create', {
        programId: 2,
        title: 'Inscripción a finales — Diciembre',
        kind: 'inscripcionFinales',
        startsOn: '2026-12-01',
        endsOn: '2026-12-05'
      })

      expect(repository.create).toHaveBeenCalledWith({
        programId: 2,
        title: 'Inscripción a finales — Diciembre',
        kind: 'inscripcionFinales',
        startsOn: '2026-12-01',
        endsOn: '2026-12-05'
      })
      expect(result).toEqual({ ok: true, data: sampleDate })
    })

    it('hands the repository the PARSED payload — a cleared end date is nulled', () => {
      invoke('fechas:create', { programId: 2, title: 'Vencimiento', kind: 'otro', startsOn: '2026-12-01', endsOn: '' })

      expect(repository.create).toHaveBeenCalledWith({
        programId: 2,
        title: 'Vencimiento',
        kind: 'otro',
        startsOn: '2026-12-01',
        endsOn: null
      })
    })

    it('rejects a kind outside the closed set without calling the repository', () => {
      const result = invoke('fechas:create', {
        programId: 2,
        title: 'Mudanza',
        kind: 'mudanza',
        startsOn: '2026-12-01',
        endsOn: null
      })

      expect(repository.create).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })

    it('rejects a window that ends before it starts', () => {
      const result = invoke('fechas:create', {
        programId: 2,
        title: 'Inscripción',
        kind: 'otro',
        startsOn: '2026-12-05',
        endsOn: '2026-12-01'
      })

      expect(repository.create).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })

    it('returns CREATE_FAILED when the repository throws — nothing crosses the bridge as an exception', () => {
      repository.create = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerFechasHandlers(repository)

      const result = invoke('fechas:create', {
        programId: 2,
        title: 'X',
        kind: 'otro',
        startsOn: '2026-12-01',
        endsOn: null
      })

      expect(result).toEqual({ ok: false, error: { code: 'CREATE_FAILED', message: 'database is locked' } })
      expect(logErrorMock).toHaveBeenCalledWith('fechas:create failed', expect.any(Error))
    })

    it('does not log an expected validation failure', () => {
      invoke('fechas:create', {})

      expect(logErrorMock).not.toHaveBeenCalled()
    })
  })

  describe('fechas:update', () => {
    it('parses a valid payload and returns the saved date', () => {
      const result = invoke('fechas:update', {
        id: 1,
        title: 'Inscripción a finales',
        kind: 'inscripcionFinales',
        startsOn: '2026-12-01',
        endsOn: '2026-12-05'
      })

      expect(repository.update).toHaveBeenCalledWith({
        id: 1,
        title: 'Inscripción a finales',
        kind: 'inscripcionFinales',
        startsOn: '2026-12-01',
        endsOn: '2026-12-05'
      })
      expect(result).toEqual({ ok: true, data: sampleDate })
    })

    it('returns NOT_FOUND when the repository reports no match', () => {
      repository.update = vi.fn().mockReturnValue(null)
      registerFechasHandlers(repository)

      const result = invoke('fechas:update', {
        id: 9999,
        title: 'X',
        kind: 'otro',
        startsOn: '2026-12-01',
        endsOn: null
      })

      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })

    it('returns UPDATE_FAILED when the repository throws', () => {
      repository.update = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerFechasHandlers(repository)

      const result = invoke('fechas:update', {
        id: 1,
        title: 'X',
        kind: 'otro',
        startsOn: '2026-12-01',
        endsOn: null
      })

      expect(result).toEqual({ ok: false, error: { code: 'UPDATE_FAILED', message: 'database is locked' } })
    })
  })

  describe('fechas:delete', () => {
    it('removes the date and returns its id', () => {
      expect(invoke('fechas:delete', { id: 1 })).toEqual({ ok: true, data: { id: 1 } })
      expect(repository.remove).toHaveBeenCalledWith(1)
    })

    it('rejects an invalid id without calling the repository', () => {
      const result = invoke('fechas:delete', { id: 'nope' })

      expect(repository.remove).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })

    it('returns NOT_FOUND when the repository reports no match', () => {
      repository.remove = vi.fn().mockReturnValue(false)
      registerFechasHandlers(repository)

      expect(invoke('fechas:delete', { id: 9999 })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })

    it('returns DELETE_FAILED when the repository throws', () => {
      repository.remove = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerFechasHandlers(repository)

      expect(invoke('fechas:delete', { id: 1 })).toEqual({
        ok: false,
        error: { code: 'DELETE_FAILED', message: 'database is locked' }
      })
    })
  })
})
