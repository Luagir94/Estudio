import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectRepository, SubjectWithSlots } from '../../materias/adapters/sqliteSubjectRepository'

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

import { registerHorarioHandlers } from './registerHorarioHandlers'

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

describe('registerHorarioHandlers', () => {
  let repository: SubjectRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    repository = {
      create: vi.fn(),
      list: vi.fn().mockReturnValue([sampleSubject]),
      detail: vi.fn(),
      updateSchedule: vi.fn(),
      remove: vi.fn(),
      setOutcome: vi.fn()
    }
    registerHorarioHandlers(repository)
  })

  it('registers ONLY a query channel — no create/delete-class channel exists (spec: "Read-Only Schedule Projection")', () => {
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(1)
    expect(ipcMainMock.handle).toHaveBeenCalledWith('horario:week', expect.any(Function))
  })

  it('horario:week returns every subject+slots from the repository wrapped in the ok envelope', () => {
    const result = invoke('horario:week')

    expect(repository.list).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, data: [sampleSubject] })
  })

  it('horario:week never throws across the bridge on a repository-level failure', () => {
    repository.list = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerHorarioHandlers(repository)

    const result = invoke('horario:week')

    expect(result).toMatchObject({ ok: false, error: { code: 'WEEK_FAILED' } })
  })

  it('logs the unexpected repository failure with its channel name', () => {
    repository.list = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerHorarioHandlers(repository)

    invoke('horario:week')

    expect(logErrorMock).toHaveBeenCalledWith('horario:week failed', expect.any(Error))
  })
})
