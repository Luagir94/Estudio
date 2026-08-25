import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinalExamRepository } from '../adapters/sqliteFinalExamRepository'
import type { FinalExamRecord } from '../../../shared/ipc/materias'

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

import { registerFinalesHandlers } from './registerFinalesHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const sampleFinal: FinalExamRecord = {
  id: 1,
  subjectId: 7,
  label: 'Mesa de agosto',
  takenOn: '2026-08-10',
  result: 'aprobado',
  grade: null
}

describe('registerFinalesHandlers', () => {
  let repository: FinalExamRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    repository = {
      create: vi.fn().mockReturnValue(sampleFinal),
      listBySubject: vi.fn().mockReturnValue([sampleFinal]),
      update: vi.fn().mockReturnValue(sampleFinal),
      remove: vi.fn().mockReturnValue(true)
    }
    registerFinalesHandlers(repository)
  })

  it('registers exactly the three finales:* channels', () => {
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(3)
    for (const channel of ['finales:create', 'finales:update', 'finales:delete']) {
      expect(ipcMainMock.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  describe('finales:create', () => {
    it('parses a valid payload and returns the created final exam', () => {
      const result = invoke('finales:create', {
        subjectId: 7,
        label: 'Mesa de agosto',
        takenOn: '2026-08-10',
        result: 'aprobado'
      })

      expect(repository.create).toHaveBeenCalledWith({
        subjectId: 7,
        label: 'Mesa de agosto',
        takenOn: '2026-08-10',
        result: 'aprobado'
      })
      expect(result).toEqual({ ok: true, data: sampleFinal })
    })

    it('hands the repository the PARSED payload — result defaulted, cleared date nulled', () => {
      invoke('finales:create', { subjectId: 7, label: 'Mesa de agosto', takenOn: '' })

      expect(repository.create).toHaveBeenCalledWith({
        subjectId: 7,
        label: 'Mesa de agosto',
        takenOn: null,
        result: 'pendiente'
      })
    })

    it('rejects an invalid payload without calling the repository (missing required fields)', () => {
      const result = invoke('finales:create', {})

      expect(repository.create).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })

    it('returns CREATE_FAILED when the repository throws — nothing crosses the bridge as an exception', () => {
      repository.create = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerFinalesHandlers(repository)

      const result = invoke('finales:create', { subjectId: 7, label: 'Mesa de agosto', takenOn: null })

      expect(result).toEqual({
        ok: false,
        error: { code: 'CREATE_FAILED', message: 'database is locked' }
      })
    })

    it('logs the unexpected repository failure with its channel name', () => {
      repository.create = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerFinalesHandlers(repository)

      invoke('finales:create', { subjectId: 7, label: 'Mesa de agosto', takenOn: null })

      expect(logErrorMock).toHaveBeenCalledWith('finales:create failed', expect.any(Error))
    })

    it('does not log an expected validation failure', () => {
      invoke('finales:create', {})

      expect(logErrorMock).not.toHaveBeenCalled()
    })
  })

  describe('finales:update', () => {
    it('parses a valid payload and returns the updated final exam — grade defaults to null', () => {
      const result = invoke('finales:update', {
        id: 1,
        label: 'Mesa de agosto',
        takenOn: '2026-08-10',
        result: 'aprobado'
      })

      expect(repository.update).toHaveBeenCalledWith({
        id: 1,
        label: 'Mesa de agosto',
        takenOn: '2026-08-10',
        result: 'aprobado',
        grade: null
      })
      expect(result).toEqual({ ok: true, data: sampleFinal })
    })

    it('hands the repository the nota riding along with an approval', () => {
      invoke('finales:update', {
        id: 1,
        label: 'Mesa de agosto',
        takenOn: '2026-08-10',
        result: 'aprobado',
        grade: 8
      })

      expect(repository.update).toHaveBeenCalledWith({
        id: 1,
        label: 'Mesa de agosto',
        takenOn: '2026-08-10',
        result: 'aprobado',
        grade: 8
      })
    })

    it('rejects an invalid payload without calling the repository (result is required here, not defaulted)', () => {
      const result = invoke('finales:update', { id: 1, label: 'Mesa de agosto', takenOn: null })

      expect(repository.update).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })

    it('returns NOT_FOUND when the repository reports no match', () => {
      repository.update = vi.fn().mockReturnValue(null)
      registerFinalesHandlers(repository)

      const result = invoke('finales:update', {
        id: 9999,
        label: 'X',
        takenOn: null,
        result: 'pendiente'
      })

      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })

    it('returns UPDATE_FAILED when the repository throws', () => {
      repository.update = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerFinalesHandlers(repository)

      const result = invoke('finales:update', {
        id: 1,
        label: 'Mesa de agosto',
        takenOn: null,
        result: 'pendiente'
      })

      expect(result).toEqual({
        ok: false,
        error: { code: 'UPDATE_FAILED', message: 'database is locked' }
      })
    })
  })

  describe('finales:delete', () => {
    it('removes the final exam and returns its id', () => {
      const result = invoke('finales:delete', { id: 1 })

      expect(repository.remove).toHaveBeenCalledWith(1)
      expect(result).toEqual({ ok: true, data: { id: 1 } })
    })

    it('rejects an invalid id without calling the repository', () => {
      const result = invoke('finales:delete', { id: 'nope' })

      expect(repository.remove).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })

    it('returns NOT_FOUND when the repository reports no match', () => {
      repository.remove = vi.fn().mockReturnValue(false)
      registerFinalesHandlers(repository)

      const result = invoke('finales:delete', { id: 9999 })

      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })

    it('returns DELETE_FAILED when the repository throws', () => {
      repository.remove = vi.fn().mockImplementation(() => {
        throw new Error('database is locked')
      })
      registerFinalesHandlers(repository)

      const result = invoke('finales:delete', { id: 1 })

      expect(result).toEqual({
        ok: false,
        error: { code: 'DELETE_FAILED', message: 'database is locked' }
      })
    })
  })
})
