import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeadlineRepository } from '../adapters/sqliteDeadlineRepository'
import type { DeadlineWithSubject } from '../../../shared/ipc/entregas'

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

import { registerEntregasHandlers } from './registerEntregasHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const sampleDeadline: DeadlineWithSubject = {
  id: 1,
  subjectId: 1,
  title: 'TP 2 — Scheduler',
  type: 'Trabajo práctico',
  dueAt: '2027-08-18T23:59',
  done: false,
  subjectName: 'Sistemas Operativos',
  subjectColor: '#4c8dff'
}

describe('registerEntregasHandlers', () => {
  let repository: DeadlineRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    repository = {
      create: vi.fn().mockReturnValue(sampleDeadline),
      list: vi.fn().mockReturnValue([sampleDeadline]),
      update: vi.fn().mockReturnValue(sampleDeadline),
      setDone: vi.fn().mockReturnValue({ ...sampleDeadline, done: true }),
      remove: vi.fn().mockReturnValue(true)
    }
    registerEntregasHandlers(repository)
  })

  it('registers exactly the five entregas:* channels', () => {
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(5)
    for (const channel of [
      'entregas:create',
      'entregas:list',
      'entregas:update',
      'entregas:setDone',
      'entregas:delete'
    ]) {
      expect(ipcMainMock.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  describe('entregas:create', () => {
    it('parses a valid payload and returns the created deadline', () => {
      const result = invoke('entregas:create', {
        title: 'TP 2 — Scheduler',
        subjectId: 1,
        type: 'Trabajo práctico',
        dueAt: '2027-08-18T23:59'
      })

      expect(repository.create).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ ok: true, data: sampleDeadline })
    })

    it('rejects an invalid payload without calling the repository (missing required fields)', () => {
      const result = invoke('entregas:create', {})

      expect(repository.create).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    })
  })

  it('entregas:list returns every deadline wrapped in the ok envelope', () => {
    const result = invoke('entregas:list')

    expect(repository.list).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, data: [sampleDeadline] })
  })

  describe('entregas:update', () => {
    it('parses a valid payload and returns the updated deadline', () => {
      const result = invoke('entregas:update', {
        id: 1,
        title: 'TP 2 — Scheduler',
        subjectId: 1,
        type: 'Trabajo práctico',
        dueAt: '2027-08-25T23:59'
      })

      expect(repository.update).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ ok: true, data: sampleDeadline })
    })

    it('returns NOT_FOUND when the repository reports no match', () => {
      repository.update = vi.fn().mockReturnValue(null)
      registerEntregasHandlers(repository)

      const result = invoke('entregas:update', {
        id: 9999,
        title: 'X',
        subjectId: 1,
        type: 'Y',
        dueAt: '2027-08-25T23:59'
      })

      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })
  })

  describe('entregas:setDone (spec: "Toggle done/pending" — binary only)', () => {
    it('toggles done and returns the updated deadline', () => {
      const result = invoke('entregas:setDone', { id: 1, done: true })

      expect(repository.setDone).toHaveBeenCalledWith(1, true)
      expect(result).toEqual({ ok: true, data: { ...sampleDeadline, done: true } })
    })

    it('returns NOT_FOUND when the repository reports no match', () => {
      repository.setDone = vi.fn().mockReturnValue(null)
      registerEntregasHandlers(repository)

      const result = invoke('entregas:setDone', { id: 9999, done: true })

      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })
  })

  describe('entregas:delete (spec: "Delete removes a cancelled deadline entirely, not as done")', () => {
    it('removes the deadline and returns its id', () => {
      const result = invoke('entregas:delete', { id: 1 })

      expect(repository.remove).toHaveBeenCalledWith(1)
      expect(result).toEqual({ ok: true, data: { id: 1 } })
    })

    it('returns NOT_FOUND when the repository reports no match', () => {
      repository.remove = vi.fn().mockReturnValue(false)
      registerEntregasHandlers(repository)

      const result = invoke('entregas:delete', { id: 9999 })

      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })
  })

  it('never throws across the bridge on a repository-level failure', () => {
    repository.list = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerEntregasHandlers(repository)

    const result = invoke('entregas:list')

    expect(result).toMatchObject({ ok: false, error: { code: 'LIST_FAILED' } })
  })

  it('logs the unexpected repository failure with its channel name', () => {
    repository.list = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerEntregasHandlers(repository)

    invoke('entregas:list')

    expect(logErrorMock).toHaveBeenCalledWith('entregas:list failed', expect.any(Error))
  })
})
