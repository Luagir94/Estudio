import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttachmentStorage } from '../adapters/fileAttachmentStorage'
import type { AttachmentRecord, AttachmentRepository } from '../adapters/sqliteAttachmentRepository'
import type { AttachmentService } from '../attachmentService'

const { ipcMainMock, dialogMock, shellMock } = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
  return {
    ipcMainMock: {
      handlers,
      handle: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener)
      })
    },
    dialogMock: { showOpenDialog: vi.fn() },
    shellMock: { openPath: vi.fn() }
  }
})

const logWarnMock = vi.hoisted(() => vi.fn())
const logErrorMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ ipcMain: ipcMainMock, dialog: dialogMock, shell: shellMock }))
vi.mock('electron-log', () => ({ default: { warn: logWarnMock, error: logErrorMock } }))

import { registerAdjuntosHandlers } from './registerAdjuntosHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const sampleRecord: AttachmentRecord = {
  id: 1,
  subjectId: 7,
  fileName: 'apuntes.pdf',
  storedPath: '7/uuid-apuntes.pdf',
  mimeType: null,
  sizeBytes: 1024,
  title: null,
  createdAt: '2026-08-16T10:00',
  indexStatus: 'pending',
  origin: 'user'
}

const sampleAttachment = {
  id: 1,
  subjectId: 7,
  fileName: 'apuntes.pdf',
  mimeType: null,
  sizeBytes: 1024,
  title: null,
  createdAt: '2026-08-16T10:00',
  indexStatus: 'pending',
  origin: 'user'
}

describe('registerAdjuntosHandlers', () => {
  let repository: AttachmentRepository
  let service: AttachmentService
  let storage: AttachmentStorage
  let subjectRepository: { detail: (id: number) => unknown }

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    dialogMock.showOpenDialog.mockReset()
    shellMock.openPath.mockReset()
    logWarnMock.mockClear()
    logErrorMock.mockClear()

    repository = {
      listBySubject: vi.fn().mockReturnValue([sampleRecord]),
      get: vi.fn().mockReturnValue(sampleRecord),
      insert: vi.fn(),
      update: vi.fn().mockReturnValue(sampleRecord),
      remove: vi.fn().mockReturnValue(sampleRecord)
    }
    service = {
      addAttachments: vi.fn().mockResolvedValue({ added: [sampleRecord], failures: [] }),
      addGeneratedAttachment: vi.fn().mockResolvedValue({ ok: true }),
      readAttachmentText: vi.fn().mockResolvedValue({ ok: true, content: '# Resumen' }),
      updateAttachmentText: vi.fn().mockResolvedValue({ ok: true, attachment: sampleRecord })
    }
    storage = {
      statSize: vi.fn().mockResolvedValue(1024),
      copyIntoSubjectDir: vi.fn(),
      writeIntoSubjectDir: vi.fn(),
      readTextFile: vi.fn().mockResolvedValue(''),
      resolveStoredPath: vi.fn().mockReturnValue('C:\\userData\\attachments\\7\\uuid-apuntes.pdf'),
      removeFile: vi.fn().mockResolvedValue(undefined),
      removeSubjectDir: vi.fn().mockResolvedValue(undefined)
    }
    subjectRepository = { detail: vi.fn().mockReturnValue({ id: 7 }) }

    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })
  })

  it('adjuntos:list rejects an invalid payload without calling the repository', () => {
    const result = invoke('adjuntos:list', { subjectId: 'nope' })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(repository.listBySubject).not.toHaveBeenCalled()
  })

  it('adjuntos:list returns the subject attachments, without storedPath, wrapped in the ok envelope', () => {
    const result = invoke('adjuntos:list', { subjectId: 7 })

    expect(repository.listBySubject).toHaveBeenCalledWith(7)
    expect(result).toEqual({ ok: true, data: [sampleAttachment] })
  })

  it('adjuntos:list never throws across the bridge on a repository-level failure', () => {
    repository.listBySubject = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    const result = invoke('adjuntos:list', { subjectId: 7 })

    expect(result).toMatchObject({ ok: false, error: { code: 'LIST_FAILED' } })
  })

  it('adjuntos:list logs the unexpected repository failure with its channel name', () => {
    repository.listBySubject = vi.fn().mockImplementation(() => {
      throw new Error('database is locked')
    })
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    invoke('adjuntos:list', { subjectId: 7 })

    expect(logErrorMock).toHaveBeenCalledWith('adjuntos:list failed', expect.any(Error))
  })

  it('adjuntos:add rejects an invalid payload without checking the subject or opening the picker', async () => {
    const result = await invoke('adjuntos:add', { subjectId: 'nope' })

    expect(subjectRepository.detail).not.toHaveBeenCalled()
    expect(dialogMock.showOpenDialog).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  })

  it('adjuntos:add returns NOT_FOUND without opening the picker when the subject does not exist', async () => {
    subjectRepository.detail = vi.fn().mockReturnValue(null)

    const result = await invoke('adjuntos:add', { subjectId: 999 })

    expect(dialogMock.showOpenDialog).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('adjuntos:add opens a multi-select native dialog ending in a "Todos los archivos" filter', async () => {
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    await invoke('adjuntos:add', { subjectId: 7 })

    const options = dialogMock.showOpenDialog.mock.calls[0]![0]
    expect(options.properties).toEqual(['openFile', 'multiSelections'])
    expect(options.filters.at(-1)).toMatchObject({ name: 'Todos los archivos' })
  })

  it('adjuntos:add reports canceled:true and calls no service method when the user dismisses the dialog', async () => {
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    const result = await invoke('adjuntos:add', { subjectId: 7 })

    expect(service.addAttachments).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, data: { canceled: true, added: [], failures: [] } })
  })

  it('adjuntos:add delegates picked files to the service and returns added/failures', async () => {
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:\\Users\\lucho\\apuntes.pdf'] })
    service.addAttachments = vi.fn().mockResolvedValue({
      added: [sampleRecord],
      failures: [{ fileName: 'huge.iso', code: 'FILE_TOO_LARGE', message: 'too big' }]
    })
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    const result = await invoke('adjuntos:add', { subjectId: 7 })

    expect(service.addAttachments).toHaveBeenCalledWith(7, ['C:\\Users\\lucho\\apuntes.pdf'])
    expect(result).toEqual({
      ok: true,
      data: {
        canceled: false,
        added: [sampleAttachment],
        failures: [{ fileName: 'huge.iso', code: 'FILE_TOO_LARGE', message: 'too big' }]
      }
    })
  })

  it('adjuntos:add never throws across the bridge when the picker itself rejects', async () => {
    dialogMock.showOpenDialog.mockRejectedValue(new Error('dialog crashed'))

    const result = await invoke('adjuntos:add', { subjectId: 7 })

    expect(result).toMatchObject({ ok: false, error: { code: 'ADD_FAILED' } })
  })

  it('adjuntos:open rejects an invalid payload without calling the repository', async () => {
    const result = await invoke('adjuntos:open', { id: 'nope' })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(repository.get).not.toHaveBeenCalled()
  })

  it('adjuntos:open returns NOT_FOUND when no row matches the id', async () => {
    repository.get = vi.fn().mockReturnValue(null)
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    const result = await invoke('adjuntos:open', { id: 999 })

    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('adjuntos:open returns OPEN_FAILED (not ATTACHMENT_FILE_MISSING) when the stored path escapes the root', async () => {
    storage.resolveStoredPath = vi.fn().mockImplementation(() => {
      throw new Error('INVALID_PATH: storedPath escapes the attachments root')
    })
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    const result = await invoke('adjuntos:open', { id: 1 })

    expect(storage.statSize).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, error: { code: 'OPEN_FAILED' } })
  })

  it('adjuntos:open returns ATTACHMENT_FILE_MISSING and leaves the row untouched when the file is gone', async () => {
    storage.statSize = vi.fn().mockRejectedValue(new Error('ENOENT'))
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    const result = await invoke('adjuntos:open', { id: 1 })

    expect(repository.remove).not.toHaveBeenCalled()
    expect(shellMock.openPath).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, error: { code: 'ATTACHMENT_FILE_MISSING' } })
  })

  it('adjuntos:open calls shell.openPath with the resolved absolute path and returns ok on success', async () => {
    shellMock.openPath.mockResolvedValue('')

    const result = await invoke('adjuntos:open', { id: 1 })

    expect(shellMock.openPath).toHaveBeenCalledWith('C:\\userData\\attachments\\7\\uuid-apuntes.pdf')
    expect(result).toEqual({ ok: true, data: undefined })
  })

  it('adjuntos:open returns OPEN_FAILED when shell.openPath returns a non-empty error string', async () => {
    shellMock.openPath.mockResolvedValue('No application is associated with this file')

    const result = await invoke('adjuntos:open', { id: 1 })

    expect(result).toMatchObject({ ok: false, error: { code: 'OPEN_FAILED' } })
  })

  it('adjuntos:delete rejects an invalid payload without calling the repository', async () => {
    const result = await invoke('adjuntos:delete', { id: 'nope' })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(repository.remove).not.toHaveBeenCalled()
  })

  it('adjuntos:delete returns NOT_FOUND when no row matches the id', async () => {
    repository.remove = vi.fn().mockReturnValue(undefined)
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    const result = await invoke('adjuntos:delete', { id: 999 })

    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('adjuntos:delete commits the row removal, then reports fileRemoved:true on a successful unlink', async () => {
    const result = await invoke('adjuntos:delete', { id: 1 })

    expect(repository.remove).toHaveBeenCalledWith(1)
    expect(storage.removeFile).toHaveBeenCalledWith('7/uuid-apuntes.pdf')
    expect(result).toEqual({ ok: true, data: { id: 1, fileRemoved: true } })
  })

  it('adjuntos:delete keeps the row deleted and reports fileRemoved:false, logging a warning, when unlink fails', async () => {
    storage.removeFile = vi.fn().mockRejectedValue(new Error('ENOENT: already gone'))
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    const result = await invoke('adjuntos:delete', { id: 1 })

    expect(logWarnMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, data: { id: 1, fileRemoved: false } })
  })

  // markdown-attachment-viewer — the viewer's read channel. Same zod-parse →
  // service → ipcOk/ipcErr shape as every handler above; the service's typed
  // error code IS the envelope code.
  it('adjuntos:read rejects an invalid payload without calling the service', async () => {
    const result = await invoke('adjuntos:read', { id: 'nope' })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(service.readAttachmentText).not.toHaveBeenCalled()
  })

  it('adjuntos:read returns the content string wrapped in the ok envelope', async () => {
    const result = await invoke('adjuntos:read', { id: 1 })

    expect(service.readAttachmentText).toHaveBeenCalledWith(1)
    expect(result).toEqual({ ok: true, data: { content: '# Resumen' } })
  })

  it("adjuntos:read maps the service's typed error code straight onto the error envelope", async () => {
    service.readAttachmentText = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'NOT_MARKDOWN', message: 'apuntes.pdf is not a .md file' })
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    const result = await invoke('adjuntos:read', { id: 1 })

    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_MARKDOWN', message: 'apuntes.pdf is not a .md file' }
    })
  })

  it('adjuntos:read never throws across the bridge when the service itself rejects', async () => {
    service.readAttachmentText = vi.fn().mockRejectedValue(new Error('unexpected'))
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    const result = await invoke('adjuntos:read', { id: 1 })

    expect(result).toMatchObject({ ok: false, error: { code: 'READ_FAILED' } })
  })

  // markdown-attachment-viewer — the editor's write channel.
  it('adjuntos:write rejects an invalid payload without calling the service', async () => {
    const result = await invoke('adjuntos:write', { id: 1 })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(service.updateAttachmentText).not.toHaveBeenCalled()
  })

  it('adjuntos:write rejects content over the 1 MiB cap at the bridge, before the service', async () => {
    const result = await invoke('adjuntos:write', { id: 1, content: 'a'.repeat(1_048_577) })

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(service.updateAttachmentText).not.toHaveBeenCalled()
  })

  it('adjuntos:write returns the updated attachment, without storedPath, wrapped in the ok envelope', async () => {
    const result = await invoke('adjuntos:write', { id: 1, content: '# Nuevo' })

    expect(service.updateAttachmentText).toHaveBeenCalledWith(1, '# Nuevo')
    expect(result).toEqual({ ok: true, data: sampleAttachment })
  })

  it("adjuntos:write maps the service's typed error code straight onto the error envelope", async () => {
    service.updateAttachmentText = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'ATTACHMENT_NOT_FOUND', message: 'No attachment with id 1' })
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    const result = await invoke('adjuntos:write', { id: 1, content: '# Nuevo' })

    expect(result).toEqual({
      ok: false,
      error: { code: 'ATTACHMENT_NOT_FOUND', message: 'No attachment with id 1' }
    })
  })

  it('adjuntos:write never throws across the bridge when the service itself rejects', async () => {
    service.updateAttachmentText = vi.fn().mockRejectedValue(new Error('unexpected'))
    registerAdjuntosHandlers({ repository, service, storage, subjectRepository })

    const result = await invoke('adjuntos:write', { id: 1, content: '# Nuevo' })

    expect(result).toMatchObject({ ok: false, error: { code: 'WRITE_FAILED' } })
  })
})
