import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
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
const sampleNote: ClassNoteRecord = { id: 2, subjectId: 7, date: '2026-08-14', preview: 'Round robin.' }

describe('registerClasesHandlers', () => {
  let repository: ClaseRepository
  let classNotes: { save: Mock; remove: Mock }

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    repository = {
      setAttendance: vi.fn().mockReturnValue(sampleMark),
      clearAttendance: vi.fn().mockReturnValue(true),
      listAttendanceBySubject: vi.fn().mockReturnValue([sampleMark]),
      listAttendance: vi.fn().mockReturnValue([sampleMark]),
      listNotesBySubject: vi.fn().mockReturnValue([sampleNote]),
      listNotes: vi.fn().mockReturnValue([sampleNote])
    }
    classNotes = {
      save: vi.fn().mockResolvedValue({ ok: true }),
      remove: vi.fn().mockResolvedValue(true)
    }
    registerClasesHandlers(repository, classNotes)
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

  // Both note commands go to the WRITER PORT, not to the repository: an
  // apunte is a markdown attachment, so writing one means a file, a preview
  // and an FTS re-index — work `attachmentService` already owns. The
  // repository only reads apuntes now.
  describe('clases:saveNote', () => {
    it('hands the apunte to the writer port and echoes the class', async () => {
      const result = await invoke('clases:saveNote', { subjectId: 7, date: '2026-08-14', body: 'Round robin.' })

      expect(result).toEqual({ ok: true, data: { subjectId: 7, date: '2026-08-14' } })
      expect(classNotes.save).toHaveBeenCalledWith(7, '2026-08-14', 'Round robin.')
    })

    /*
     * The response carries the CLASS, never the stored row. The apunte's text
     * lives in a file now, and echoing a body the caller just sent would be
     * inventing a second source of truth for it.
     */
    it('never echoes the apunte body back', async () => {
      const result = (await invoke('clases:saveNote', {
        subjectId: 7,
        date: '2026-08-14',
        body: 'Round robin.'
      })) as { data: Record<string, unknown> }

      expect(result.data).not.toHaveProperty('body')
      expect(result.data).not.toHaveProperty('preview')
    })

    it('rejects an oversized body without touching the writer', async () => {
      const result = await invoke('clases:saveNote', { subjectId: 7, date: '2026-08-14', body: 'a'.repeat(20001) })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(classNotes.save).not.toHaveBeenCalled()
    })

    /*
     * A write that failed on disk must reach the student as a failure. The
     * apunte is the one thing in this dialog that cannot be re-derived, so a
     * silent ok here would be the app telling them their work was saved when
     * it was not.
     */
    it('maps the writer-s typed failure onto the error envelope', async () => {
      classNotes.save = vi.fn().mockResolvedValue({ ok: false, code: 'WRITE_FAILED', message: 'disk full' })

      const result = await invoke('clases:saveNote', { subjectId: 7, date: '2026-08-14', body: 'Round robin.' })

      expect(result).toMatchObject({ ok: false, error: { code: 'WRITE_FAILED' } })
    })

    it('reports an unexpected throw instead of crossing the bridge with it', async () => {
      classNotes.save = vi.fn().mockRejectedValue(new Error('boom'))

      const result = await invoke('clases:saveNote', { subjectId: 7, date: '2026-08-14', body: 'Round robin.' })

      expect(result).toMatchObject({ ok: false, error: { code: 'SAVE_NOTE_FAILED' } })
    })
  })

  describe('clases:deleteNote', () => {
    it('echoes the class whose apunte was deleted', async () => {
      expect(await invoke('clases:deleteNote', { subjectId: 7, date: '2026-08-14' })).toEqual({
        ok: true,
        data: { subjectId: 7, date: '2026-08-14' }
      })
      expect(classNotes.remove).toHaveBeenCalledWith(7, '2026-08-14')
    })

    it('succeeds even when the class had no apunte', async () => {
      classNotes.remove = vi.fn().mockResolvedValue(false)

      expect(await invoke('clases:deleteNote', { subjectId: 7, date: '2026-08-14' })).toMatchObject({ ok: true })
    })

    it('rejects a missing date without touching the writer', async () => {
      const result = await invoke('clases:deleteNote', { subjectId: 7 })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(classNotes.remove).not.toHaveBeenCalled()
    })
  })
})
