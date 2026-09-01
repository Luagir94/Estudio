import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaseRepository } from '../../clases/adapters/sqliteClaseRepository'
import type { DeadlineRepository } from '../../entregas/adapters/sqliteDeadlineRepository'
import type { SubjectRepository, SubjectWithSlots } from '../../materias/adapters/sqliteSubjectRepository'
import type { DeadlineWithSubject } from '../../../shared/ipc/entregas'
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

import { registerHoyHandlers } from './registerHoyHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const sampleSubject: SubjectWithSlots = {
  id: 1,
  name: 'Sistemas Operativos',
  code: 'SO-101',
  color: '#4c8dff',
  docente: null,
  contacto: null,
  comision: null,
  aula: null,
  campusUrl: null,
  groupUrl: null,
  notas: null,
  attendanceMinPercent: null,
  periodId: null,
  programId: null,
  nivel: null,
  outcome: null,
  grade: null,
  regularity: null,
  slots: [{ id: 1, subjectId: 1, dayOfWeek: 1, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }]
}

const sampleDeadline: DeadlineWithSubject = {
  id: 1,
  subjectId: 1,
  title: 'TP 1',
  type: 'Trabajo práctico',
  dueAt: '2026-08-20T23:59',
  done: false,
  subjectName: 'Sistemas Operativos',
  subjectColor: '#4c8dff'
}

const sampleMark: AttendanceRecord = { id: 1, subjectId: 1, date: '2026-08-17', status: 'presente' }

const sampleNote: ClassNoteRecord = { id: 1, subjectId: 1, date: '2026-08-17', preview: 'Round robin y starvation.' }

describe('registerHoyHandlers', () => {
  let subjectRepository: SubjectRepository
  let deadlineRepository: DeadlineRepository
  let claseRepository: ClaseRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    subjectRepository = {
      create: vi.fn(),
      list: vi.fn().mockReturnValue([sampleSubject]),
      detail: vi.fn(),
      updateSchedule: vi.fn(),
      remove: vi.fn(),
      setOutcome: vi.fn()
    }
    deadlineRepository = {
      create: vi.fn(),
      list: vi.fn().mockReturnValue([sampleDeadline]),
      update: vi.fn(),
      setDone: vi.fn(),
      remove: vi.fn()
    }
    claseRepository = {
      setAttendance: vi.fn(),
      clearAttendance: vi.fn(),
      listAttendanceBySubject: vi.fn(),
      listAttendance: vi.fn().mockReturnValue([sampleMark]),
      listNotesBySubject: vi.fn(),
      listNotes: vi.fn().mockReturnValue([sampleNote])
    }
    registerHoyHandlers(subjectRepository, deadlineRepository, claseRepository)
  })

  // Still exactly one channel. Hoy gained write AFFORDANCES with the class
  // marks, but they invoke `clases:*` — this module stays a pure read.
  it('registers ONLY a query channel — the class-mark writes live on clases:*', () => {
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(1)
    expect(ipcMainMock.handle).toHaveBeenCalledWith('hoy:dashboard', expect.any(Function))
  })

  it('hoy:dashboard returns every subject+slots AND every deadline from the SAME repositories materias/entregas already use', () => {
    const result = invoke('hoy:dashboard')

    expect(subjectRepository.list).toHaveBeenCalledTimes(1)
    expect(deadlineRepository.list).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ok: true,
      data: {
        subjects: [sampleSubject],
        deadlines: [sampleDeadline],
        attendance: [sampleMark],
        classNotes: [sampleNote]
      }
    })
  })

  // Unfiltered by any clock: main never asks what "today" is, so a cached
  // payload cannot go stale at midnight. The renderer crosses these rows with
  // its own date.
  it('serves every mark and apunte unfiltered — main applies no date filter', () => {
    invoke('hoy:dashboard')

    expect(claseRepository.listAttendance).toHaveBeenCalledWith()
    expect(claseRepository.listNotes).toHaveBeenCalledWith()
  })

  it('never throws across the bridge on a repository-level failure', () => {
    subjectRepository.list = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerHoyHandlers(subjectRepository, deadlineRepository, claseRepository)

    const result = invoke('hoy:dashboard')

    expect(result).toMatchObject({ ok: false, error: { code: 'DASHBOARD_FAILED' } })
  })

  it('logs the unexpected repository failure with its channel name', () => {
    subjectRepository.list = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerHoyHandlers(subjectRepository, deadlineRepository, claseRepository)

    invoke('hoy:dashboard')

    expect(logErrorMock).toHaveBeenCalledWith('hoy:dashboard failed', expect.any(Error))
  })
})
