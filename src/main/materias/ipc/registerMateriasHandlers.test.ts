import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MateriasService } from '../materiasService'
import type { SubjectRepository, SubjectWithDetail, SubjectWithSlots } from '../adapters/sqliteSubjectRepository'

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

import { registerMateriasHandlers } from './registerMateriasHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const sampleSubject: SubjectWithSlots = {
  id: 1,
  name: 'Algoritmos',
  code: 'ALG-101',
  color: '#7c3aed',
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
  slots: [{ id: 1, subjectId: 1, dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: null }]
}

const sampleDetail: SubjectWithDetail = {
  ...sampleSubject,
  deadlines: [{ id: 1, subjectId: 1, title: 'TP1', type: 'tp', dueAt: '2026-04-01T23:59', done: false }],
  period: null,
  program: null,
  finals: [],
  parciales: [],
  attendance: [],
  classNotes: [],
  prerequisites: []
}

describe('registerMateriasHandlers', () => {
  let repository: SubjectRepository
  let materiasService: MateriasService

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    repository = {
      create: vi.fn().mockReturnValue(sampleSubject),
      list: vi.fn().mockReturnValue([sampleSubject]),
      detail: vi.fn().mockReturnValue(sampleDetail),
      updateSchedule: vi.fn().mockReturnValue(sampleSubject),
      remove: vi.fn().mockReturnValue({ deletedSlots: 1, deletedDeadlines: 1 }),
      setOutcome: vi.fn().mockReturnValue({ ...sampleSubject, outcome: 'aprobada', grade: 8, period: null, finals: [] })
    }
    materiasService = {
      deleteSubject: vi.fn().mockResolvedValue({ deletedSlots: 1, deletedDeadlines: 1 })
    }
    registerMateriasHandlers(repository, { materiasService })
  })

  it('materias:create rejects an invalid payload without calling the repository', () => {
    const result = invoke('materias:create', { name: '', code: '', color: '', slots: [] })

    expect(result).toMatchObject({ ok: false })
    expect(repository.create).not.toHaveBeenCalled()
  })

  // A subject with no period is a half-subject (no carrera, no closable
  // status, no grade), so the boundary refuses to create one — not just the
  // form.
  it('materias:create refuses a subject with no período', () => {
    const result = invoke('materias:create', {
      name: 'Algoritmos',
      code: 'ALG-101',
      color: '#7c3aed',
      slots: [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 660 }]
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('materias:create parses a valid payload and returns the repository result', () => {
    const result = invoke('materias:create', {
      name: 'Algoritmos',
      code: 'ALG-101',
      color: '#7c3aed',
      periodId: 7,
      slots: [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 660 }]
    })

    expect(repository.create).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, data: sampleSubject })
  })

  it('materias:create never throws across the bridge — a repository-level failure becomes an error envelope', () => {
    // Payload is Zod-valid (endMinutes > startMinutes); the failure comes
    // from the repository/transaction layer (e.g. a DB constraint), not
    // from input shape — proving the handler's try/catch, not the schema
    // refinement already covered by the previous test.
    repository.create = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerMateriasHandlers(repository, { materiasService })

    const result = invoke('materias:create', {
      name: 'Bases de Datos',
      code: 'BD-201',
      color: '#22c55e',
      periodId: 7,
      slots: [{ dayOfWeek: 2, startMinutes: 600, endMinutes: 650 }]
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'CREATE_FAILED' } })
  })

  it('materias:create logs the unexpected repository failure with its channel name', () => {
    repository.create = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerMateriasHandlers(repository, { materiasService })

    invoke('materias:create', {
      name: 'Bases de Datos',
      code: 'BD-201',
      color: '#22c55e',
      periodId: 7,
      slots: [{ dayOfWeek: 2, startMinutes: 600, endMinutes: 650 }]
    })

    expect(logErrorMock).toHaveBeenCalledWith('materias:create failed', expect.any(Error))
  })

  it('materias:list returns every subject from the repository wrapped in the ok envelope', () => {
    const result = invoke('materias:list')

    expect(repository.list).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, data: [sampleSubject] })
  })

  it('materias:detail rejects an invalid payload without calling the repository', () => {
    const result = invoke('materias:detail', { id: 'not-a-number' })

    expect(result).toMatchObject({ ok: false })
    expect(repository.detail).not.toHaveBeenCalled()
  })

  it('materias:detail returns NOT_FOUND when the repository finds nothing', () => {
    repository.detail = vi.fn().mockReturnValue(null)
    registerMateriasHandlers(repository, { materiasService })

    const result = invoke('materias:detail', { id: 999 })

    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('materias:detail returns the aggregated subject+slots+deadlines', () => {
    const result = invoke('materias:detail', { id: 1 })

    expect(repository.detail).toHaveBeenCalledWith(1)
    expect(result).toEqual({ ok: true, data: sampleDetail })
  })

  it('materias:updateSchedule rejects an invalid payload (empty slots) without calling the repository', () => {
    const result = invoke('materias:updateSchedule', { id: 1, name: '', code: '', color: '', slots: [] })

    expect(result).toMatchObject({ ok: false })
    expect(repository.updateSchedule).not.toHaveBeenCalled()
  })

  it('materias:updateSchedule parses a valid payload and returns the repository result', () => {
    const result = invoke('materias:updateSchedule', {
      id: 1,
      name: 'Algoritmos I',
      code: 'ALG-101',
      color: '#7c3aed',
      slots: [{ dayOfWeek: 2, startMinutes: 480, endMinutes: 540 }]
    })

    expect(repository.updateSchedule).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, data: sampleSubject })
  })

  it('materias:updateSchedule never throws across the bridge on a repository-level failure', () => {
    repository.updateSchedule = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerMateriasHandlers(repository, { materiasService })

    const result = invoke('materias:updateSchedule', {
      id: 1,
      name: 'Algoritmos I',
      code: 'ALG-101',
      color: '#7c3aed',
      slots: [{ dayOfWeek: 2, startMinutes: 480, endMinutes: 540 }]
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'UPDATE_FAILED' } })
  })

  it('materias:delete rejects an invalid payload without calling materiasService', async () => {
    const result = await invoke('materias:delete', { id: 'not-a-number' })

    expect(result).toMatchObject({ ok: false })
    expect(materiasService.deleteSubject).not.toHaveBeenCalled()
  })

  // The row-then-attachment-directory cascade itself is materiasService's
  // responsibility now (see materiasService.test.ts) — this handler only
  // needs to prove it delegates the id and translates the service result.
  it('materias:delete returns NOT_FOUND when materiasService finds nothing to delete', async () => {
    materiasService.deleteSubject = vi.fn().mockResolvedValue(null)
    registerMateriasHandlers(repository, { materiasService })

    const result = await invoke('materias:delete', { id: 999 })

    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('materias:delete calls materiasService.deleteSubject with the parsed id and returns its result', async () => {
    const result = await invoke('materias:delete', { id: 1 })

    expect(materiasService.deleteSubject).toHaveBeenCalledWith(1)
    expect(result).toEqual({ ok: true, data: { deletedSlots: 1, deletedDeadlines: 1 } })
  })

  it('materias:delete never throws across the bridge on a materiasService-level failure', async () => {
    materiasService.deleteSubject = vi.fn().mockRejectedValue(new Error('database is locked'))
    registerMateriasHandlers(repository, { materiasService })

    const result = await invoke('materias:delete', { id: 1 })

    expect(result).toMatchObject({ ok: false, error: { code: 'DELETE_FAILED' } })
    expect(logErrorMock).toHaveBeenCalledWith('materias:delete failed', expect.any(Error))
  })
})
