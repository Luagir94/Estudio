import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaseRepository } from '../adapters/sqliteClaseRepository'
import type { AttendanceRecord, ClassNoteRecord } from '../../../shared/ipc/materias'

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

import { registerClasesHandlers } from './registerClasesHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const sampleMark: AttendanceRecord = { id: 1, subjectId: 7, date: '2026-08-14', status: 'presente' }
const sampleNote: ClassNoteRecord = { id: 2, subjectId: 7, date: '2026-08-14', body: 'Round robin.' }

describe('registerClasesHandlers', () => {
  let repository: ClaseRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    repository = {
      setAttendance: vi.fn().mockReturnValue(sampleMark),
      clearAttendance: vi.fn().mockReturnValue(true),
      listAttendanceBySubject: vi.fn().mockReturnValue([sampleMark]),
      listAttendance: vi.fn().mockReturnValue([sampleMark]),
      saveNote: vi.fn().mockReturnValue(sampleNote),
      deleteNote: vi.fn().mockReturnValue(true),
      listNotesBySubject: vi.fn().mockReturnValue([sampleNote]),
      listNotes: vi.fn().mockReturnValue([sampleNote])
    }
    registerClasesHandlers(repository)
  })

  // Four, not five: there is no `clases:list` — marks and apuntes ride on
  // `materias:detail` and `hoy:dashboard`, the same way parciales do.
  it('registers exactly the four clases:* channels', () => {
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(4)
    for (const channel of ['clases:setAttendance', 'clases:clearAttendance', 'clases:saveNote', 'clases:deleteNote']) {
      expect(ipcMainMock.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  describe('clases:setAttendance', () => {
    it('parses a valid payload and returns the stored mark', () => {
      const result = invoke('clases:setAttendance', { subjectId: 7, date: '2026-08-14', status: 'presente' })

      expect(result).toEqual({ ok: true, data: sampleMark })
      expect(repository.setAttendance).toHaveBeenCalledWith({ subjectId: 7, date: '2026-08-14', status: 'presente' })
    })

    it('rejects a status outside the closed set without touching the repository', () => {
      const result = invoke('clases:setAttendance', { subjectId: 7, date: '2026-08-14', status: 'tarde' })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(repository.setAttendance).not.toHaveBeenCalled()
    })

    it('returns a typed error envelope when the write throws', () => {
      repository.setAttendance = vi.fn().mockImplementation(() => {
        throw new Error('disk is full')
      })

      const result = invoke('clases:setAttendance', { subjectId: 7, date: '2026-08-14', status: 'presente' })

      expect(result).toMatchObject({ ok: false, error: { code: 'SET_ATTENDANCE_FAILED' } })
      expect(logErrorMock).toHaveBeenCalled()
    })
  })

  describe('clases:clearAttendance', () => {
    it('echoes the class that was cleared', () => {
      const result = invoke('clases:clearAttendance', { subjectId: 7, date: '2026-08-14' })

      expect(result).toEqual({ ok: true, data: { subjectId: 7, date: '2026-08-14' } })
    })

    // Clearing an unmarked class is the SAME outcome the caller asked for, so
    // it is a success, not a NOT_FOUND: two clicks on the active button must
    // not surface an error the second time.
    it('succeeds even when the class was not marked', () => {
      repository.clearAttendance = vi.fn().mockReturnValue(false)

      expect(invoke('clases:clearAttendance', { subjectId: 7, date: '2026-08-14' })).toEqual({
        ok: true,
        data: { subjectId: 7, date: '2026-08-14' }
      })
    })
  })

  describe('clases:saveNote', () => {
    it('parses a valid payload and returns the stored apunte', () => {
      const result = invoke('clases:saveNote', { subjectId: 7, date: '2026-08-14', body: 'Round robin.' })

      expect(result).toEqual({ ok: true, data: sampleNote })
      expect(repository.saveNote).toHaveBeenCalledWith({ subjectId: 7, date: '2026-08-14', body: 'Round robin.' })
    })

    it('rejects an oversized body without touching the repository', () => {
      const result = invoke('clases:saveNote', { subjectId: 7, date: '2026-08-14', body: 'a'.repeat(20001) })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(repository.saveNote).not.toHaveBeenCalled()
    })
  })

  describe('clases:deleteNote', () => {
    it('echoes the class whose apunte was deleted', () => {
      expect(invoke('clases:deleteNote', { subjectId: 7, date: '2026-08-14' })).toEqual({
        ok: true,
        data: { subjectId: 7, date: '2026-08-14' }
      })
    })

    it('succeeds even when the class had no apunte', () => {
      repository.deleteNote = vi.fn().mockReturnValue(false)

      expect(invoke('clases:deleteNote', { subjectId: 7, date: '2026-08-14' })).toMatchObject({ ok: true })
    })

    it('rejects a missing date without touching the repository', () => {
      const result = invoke('clases:deleteNote', { subjectId: 7 })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(repository.deleteNote).not.toHaveBeenCalled()
    })
  })
})
