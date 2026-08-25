// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttendanceRecord, ClassNoteRecord } from '../../../shared/ipc/materias'
import { ClasesApiError, clasesApi } from './clasesApi'

const sampleMark: AttendanceRecord = { id: 1, subjectId: 7, date: '2026-08-14', status: 'presente' }
const sampleNote: ClassNoteRecord = { id: 2, subjectId: 7, date: '2026-08-14', body: 'Round robin.' }

describe('clasesApi', () => {
  beforeEach(() => {
    // @ts-expect-error test-only global stub
    window.api = {
      clases: {
        setAttendance: vi.fn(),
        clearAttendance: vi.fn(),
        saveNote: vi.fn(),
        deleteNote: vi.fn()
      }
    }
  })

  it('setAttendance parses and returns the stored mark', async () => {
    vi.mocked(window.api.clases.setAttendance).mockResolvedValue({ ok: true, data: sampleMark })

    expect(await clasesApi.setAttendance({ subjectId: 7, date: '2026-08-14', status: 'presente' })).toEqual(sampleMark)
  })

  // The renderer maps its Spanish copy off the CODE, never `message`
  // (`shared/lib/ipcErrorCopy.ts`) — so the throw must carry it.
  it('setAttendance throws a ClasesApiError carrying the envelope code', async () => {
    vi.mocked(window.api.clases.setAttendance).mockResolvedValue({
      ok: false,
      error: { code: 'SET_ATTENDANCE_FAILED', message: 'database is locked' }
    })

    const error: unknown = await clasesApi
      .setAttendance({ subjectId: 7, date: '2026-08-14', status: 'presente' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ClasesApiError)
    expect((error as ClasesApiError).code).toBe('SET_ATTENDANCE_FAILED')
  })

  it('clearAttendance parses and echoes the class that was cleared', async () => {
    vi.mocked(window.api.clases.clearAttendance).mockResolvedValue({
      ok: true,
      data: { subjectId: 7, date: '2026-08-14' }
    })

    expect(await clasesApi.clearAttendance({ subjectId: 7, date: '2026-08-14' })).toEqual({
      subjectId: 7,
      date: '2026-08-14'
    })
  })

  it('saveNote parses and returns the stored apunte', async () => {
    vi.mocked(window.api.clases.saveNote).mockResolvedValue({ ok: true, data: sampleNote })

    expect(await clasesApi.saveNote({ subjectId: 7, date: '2026-08-14', body: 'Round robin.' })).toEqual(sampleNote)
  })

  it('deleteNote parses and echoes the class whose apunte was removed', async () => {
    vi.mocked(window.api.clases.deleteNote).mockResolvedValue({ ok: true, data: { subjectId: 7, date: '2026-08-14' } })

    expect(await clasesApi.deleteNote({ subjectId: 7, date: '2026-08-14' })).toEqual({
      subjectId: 7,
      date: '2026-08-14'
    })
  })

  it('deleteNote throws a ClasesApiError carrying the envelope code', async () => {
    vi.mocked(window.api.clases.deleteNote).mockResolvedValue({
      ok: false,
      error: { code: 'DELETE_NOTE_FAILED', message: 'database is locked' }
    })

    const error: unknown = await clasesApi
      .deleteNote({ subjectId: 7, date: '2026-08-14' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ClasesApiError)
    expect((error as ClasesApiError).code).toBe('DELETE_NOTE_FAILED')
  })
})
