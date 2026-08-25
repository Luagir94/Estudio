import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeadlineRepository } from '../entregas/adapters/sqliteDeadlineRepository'
import type { SubjectRepository, SubjectWithSlots } from '../materias/adapters/sqliteSubjectRepository'
import type { DeadlineWithSubject } from '../../shared/ipc/entregas'

const { ipcMainMock, shellMock, dialogMock, appMock, writeFileMock } = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
  return {
    ipcMainMock: {
      handlers,
      handle: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener)
      })
    },
    shellMock: {
      openExternal: vi.fn().mockResolvedValue(undefined)
    },
    dialogMock: {
      showSaveDialog: vi.fn()
    },
    appMock: {
      getPath: vi.fn().mockReturnValue('/home/user/Documents')
    },
    writeFileMock: vi.fn().mockResolvedValue(undefined)
  }
})

const logWarnMock = vi.hoisted(() => vi.fn())
const logErrorMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ ipcMain: ipcMainMock, shell: shellMock, dialog: dialogMock, app: appMock }))
vi.mock('electron-log', () => ({ default: { warn: logWarnMock, error: logErrorMock } }))
vi.mock('node:fs/promises', () => ({ writeFile: writeFileMock }))

import { registerAppHandlers } from './registerAppHandlers'

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

describe('registerAppHandlers', () => {
  let subjectRepository: SubjectRepository
  let deadlineRepository: DeadlineRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    shellMock.openExternal.mockClear()
    logWarnMock.mockClear()
    logErrorMock.mockClear()
    dialogMock.showSaveDialog.mockReset()
    writeFileMock.mockClear()
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
    registerAppHandlers({ subjectRepository, deadlineRepository })
  })

  it('app:openExternal opens an https URL via shell.openExternal', async () => {
    const result = await invoke('app:openExternal', { url: 'https://campus.uni.edu/course/1' })

    expect(shellMock.openExternal).toHaveBeenCalledWith('https://campus.uni.edu/course/1')
    expect(result).toEqual({ ok: true, data: undefined })
    expect(logWarnMock).not.toHaveBeenCalled()
  })

  it('app:openExternal refuses a javascript: URL, logs the rejection, and never calls shell.openExternal', async () => {
    const result = await invoke('app:openExternal', { url: 'javascript:alert(1)' })

    expect(shellMock.openExternal).not.toHaveBeenCalled()
    expect(logWarnMock).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ ok: false, error: { code: 'URL_REFUSED' } })
  })

  it('app:openExternal refuses a malformed URL without throwing across the bridge', async () => {
    const result = await invoke('app:openExternal', { url: 'ht!tp:/ /not a url' })

    expect(shellMock.openExternal).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, error: { code: 'URL_REFUSED' } })
  })

  it('app:openExternal rejects a non-string payload without calling shell.openExternal', async () => {
    const result = await invoke('app:openExternal', { url: 123 })

    expect(shellMock.openExternal).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  })

  it('app:exportJson defaults the save dialog to the Documents folder', async () => {
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })

    await invoke('app:exportJson')

    expect(appMock.getPath).toHaveBeenCalledWith('documents')
    const options = dialogMock.showSaveDialog.mock.calls[0]![0]
    expect(
      options.defaultPath.startsWith('/home/user/Documents') ||
        options.defaultPath.startsWith('\\home\\user\\Documents')
    ).toBe(true)
  })

  it('app:exportJson writes nothing and reports canceled:true when the user dismisses the dialog', async () => {
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })

    const result = await invoke('app:exportJson')

    expect(writeFileMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, data: { canceled: true, filePath: null } })
  })

  it('app:exportJson writes a complete, human-readable snapshot of subjects/slots/deadlines on confirm', async () => {
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/home/user/Documents/export.json' })

    const result = await invoke('app:exportJson')

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    const [writtenPath, writtenContent] = writeFileMock.mock.calls[0]!
    expect(writtenPath).toBe('/home/user/Documents/export.json')

    const snapshot = JSON.parse(writtenContent as string)
    expect(snapshot.subjects).toEqual([
      expect.objectContaining({
        name: 'Sistemas Operativos',
        scheduleSlots: [
          expect.objectContaining({ dayOfWeek: 1, startMinutes: 480, endMinutes: 570, location: 'Aula 204' })
        ]
      })
    ])
    expect(snapshot.deadlines).toEqual([expect.objectContaining({ title: 'TP 1', subjectName: 'Sistemas Operativos' })])
    // Local-naive datetime, NOT toISOString() (design §3a — no trailing Z/offset).
    expect(snapshot.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)

    expect(result).toEqual({ ok: true, data: { canceled: false, filePath: '/home/user/Documents/export.json' } })
  })

  it('app:exportJson never throws across the bridge on a repository-level failure', async () => {
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/home/user/Documents/export.json' })
    subjectRepository.list = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerAppHandlers({ subjectRepository, deadlineRepository })

    const result = await invoke('app:exportJson')

    expect(result).toMatchObject({ ok: false, error: { code: 'EXPORT_FAILED' } })
  })

  it('app:exportJson logs the unexpected failure with its channel name', async () => {
    dialogMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/home/user/Documents/export.json' })
    subjectRepository.list = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerAppHandlers({ subjectRepository, deadlineRepository })

    await invoke('app:exportJson')

    expect(logErrorMock).toHaveBeenCalledWith('app:exportJson failed', expect.any(Error))
  })
})
