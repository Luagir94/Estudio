import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PartialExamRepository } from '../adapters/sqlitePartialExamRepository'
import type { PartialExamRecord } from '../../../shared/ipc/materias'

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

import { registerParcialesHandlers } from './registerParcialesHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const sampleParcial: PartialExamRecord = {
  id: 1,
  subjectId: 7,
  label: '1er parcial',
  takenOn: '2026-05-12',
  result: 'aprobado',
  grade: 8
}

describe('registerParcialesHandlers', () => {
  let repository: PartialExamRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    repository = {
      create: vi.fn().mockReturnValue(sampleParcial),
      listBySubject: vi.fn().mockReturnValue([sampleParcial]),
      update: vi.fn().mockReturnValue(sampleParcial),
      remove: vi.fn().mockReturnValue(true)
    }
    registerParcialesHandlers(repository)
  })

  // Three, not four: there is no `parciales:list` — the rows ride on
  // `materias:detail`, the same way final exams do.
  it('registers exactly the three parciales:* channels', () => {
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(3)
    for (const channel of ['parciales:create', 'parciales:update', 'parciales:delete']) {
      expect(ipcMainMock.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  describe('parciales:create', () => {
    it('parses a valid payload and returns the created parcial', () => {
      const result = invoke('parciales:create', {
        subjectId: 7,
        label: '1er parcial',
        takenOn: '2026-05-12',
        result: 'aprobado',
        grade: 8
      })

      expect(result).toEqual({ ok: true, data: sampleParcial })
      expect(repository.create).toHaveBeenCalledWith({
        subjectId: 7,
        label: '1er parcial',
        takenOn: '2026-05-12',
        result: 'aprobado',
        grade: 8
      })
    })

    it('rejects an invalid payload without touching the repository', () => {
      const result = invoke('parciales:create', { subjectId: 7, label: '  ' })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(repository.create).not.toHaveBeenCalled()
    })

    // A nota the program's scheme refuses throws inside the repository; it
    // must reach the bridge as an envelope, never as a rejected promise.
    it('reports a repository failure as an envelope, not a throw', () => {
      repository.create = vi.fn(() => {
        throw new Error('a pass/fail program does not carry grades')
      })
      registerParcialesHandlers(repository)

      const result = invoke('parciales:create', { subjectId: 7, label: '1er parcial', takenOn: null, grade: 8 })

      expect(result).toMatchObject({ ok: false, error: { code: 'CREATE_FAILED' } })
      expect(logErrorMock).toHaveBeenCalled()
    })
  })

  describe('parciales:update', () => {
    it('parses a valid payload and returns the updated parcial', () => {
      const result = invoke('parciales:update', {
        id: 1,
        label: '1er parcial',
        takenOn: '2026-05-12',
        result: 'aprobado',
        grade: 8
      })

      expect(result).toEqual({ ok: true, data: sampleParcial })
    })

    it('reports an unknown id as NOT_FOUND', () => {
      repository.update = vi.fn().mockReturnValue(null)
      registerParcialesHandlers(repository)

      const result = invoke('parciales:update', { id: 99, label: 'x', takenOn: null, result: 'pendiente' })

      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })

    it('rejects an invalid payload without touching the repository', () => {
      const result = invoke('parciales:update', { id: 1, label: '1er parcial', takenOn: null, result: 'ausente' })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(repository.update).not.toHaveBeenCalled()
    })
  })

  describe('parciales:delete', () => {
    it('confirms the deleted id', () => {
      expect(invoke('parciales:delete', { id: 1 })).toEqual({ ok: true, data: { id: 1 } })
      expect(repository.remove).toHaveBeenCalledWith(1)
    })

    it('reports an unknown id as NOT_FOUND', () => {
      repository.remove = vi.fn().mockReturnValue(false)
      registerParcialesHandlers(repository)

      expect(invoke('parciales:delete', { id: 99 })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })

    it('rejects an invalid id without touching the repository', () => {
      expect(invoke('parciales:delete', { id: 0 })).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' }
      })
      expect(repository.remove).not.toHaveBeenCalled()
    })
  })
})
