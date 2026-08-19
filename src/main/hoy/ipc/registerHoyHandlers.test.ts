import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeadlineRepository } from '../../entregas/adapters/sqliteDeadlineRepository'
import type { SubjectRepository, SubjectWithSlots } from '../../materias/adapters/sqliteSubjectRepository'
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

vi.mock('electron', () => ({ ipcMain: ipcMainMock }))

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
  campusUrl: null,
  notas: null,
  attendanceMinPercent: null,
  periodId: null,
  outcome: null,
  grade: null,
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

describe('registerHoyHandlers', () => {
  let subjectRepository: SubjectRepository
  let deadlineRepository: DeadlineRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
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
    registerHoyHandlers(subjectRepository, deadlineRepository)
  })

  it('registers ONLY a query channel — Hoy is a pure read-model, no command channel exists', () => {
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(1)
    expect(ipcMainMock.handle).toHaveBeenCalledWith('hoy:dashboard', expect.any(Function))
  })

  it('hoy:dashboard returns every subject+slots AND every deadline from the SAME repositories materias/entregas already use', () => {
    const result = invoke('hoy:dashboard')

    expect(subjectRepository.list).toHaveBeenCalledTimes(1)
    expect(deadlineRepository.list).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, data: { subjects: [sampleSubject], deadlines: [sampleDeadline] } })
  })

  it('never throws across the bridge on a repository-level failure', () => {
    subjectRepository.list = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerHoyHandlers(subjectRepository, deadlineRepository)

    const result = invoke('hoy:dashboard')

    expect(result).toMatchObject({ ok: false, error: { code: 'DASHBOARD_FAILED' } })
  })
})
