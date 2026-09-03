import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttachmentStorage } from '../adjuntos/adapters/fileAttachmentStorage'
import type { SubjectRepository, SubjectWithSlots } from './adapters/sqliteSubjectRepository'
import { createMateriasService, type MateriasService } from './materiasService'

const logWarnMock = vi.hoisted(() => vi.fn())

vi.mock('electron-log', () => ({ default: { warn: logWarnMock } }))

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
  slots: []
}

function createRepositoryMock(overrides: Partial<SubjectRepository> = {}): SubjectRepository {
  return {
    create: vi.fn().mockReturnValue(sampleSubject),
    list: vi.fn().mockReturnValue([sampleSubject]),
    detail: vi.fn().mockReturnValue(null),
    updateSchedule: vi.fn().mockReturnValue(sampleSubject),
    remove: vi.fn().mockReturnValue({ deletedSlots: 1, deletedDeadlines: 1 }),
    setOutcome: vi.fn().mockReturnValue(null),
    ...overrides
  }
}

function createAttachmentStorageMock(overrides: Partial<AttachmentStorage> = {}): AttachmentStorage {
  return {
    statSize: vi.fn(),
    copyIntoSubjectDir: vi.fn(),
    writeIntoSubjectDir: vi.fn(),
    readTextFile: vi.fn(),
    resolveStoredPath: vi.fn(),
    removeFile: vi.fn(),
    removeSubjectDir: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

describe('createMateriasService', () => {
  let repository: SubjectRepository
  let attachmentStorage: AttachmentStorage
  let service: MateriasService

  beforeEach(() => {
    logWarnMock.mockClear()
    repository = createRepositoryMock()
    attachmentStorage = createAttachmentStorageMock()
    service = createMateriasService({ repository, attachmentStorage })
  })

  it('deleteSubject removes the row then removes the attachment directory, returning the deleted counts', async () => {
    const result = await service.deleteSubject(1)

    expect(repository.remove).toHaveBeenCalledWith(1)
    expect(attachmentStorage.removeSubjectDir).toHaveBeenCalledWith(1)
    expect(result).toEqual({ deletedSlots: 1, deletedDeadlines: 1 })
  })

  it('deleteSubject returns null and never attempts cleanup when the subject was never found', async () => {
    repository = createRepositoryMock({ remove: vi.fn().mockReturnValue(null) })
    service = createMateriasService({ repository, attachmentStorage })

    const result = await service.deleteSubject(999)

    expect(result).toBeNull()
    expect(attachmentStorage.removeSubjectDir).not.toHaveBeenCalled()
  })

  it('deleteSubject logs a warning and still returns the deleted counts when attachment cleanup fails — the await is what makes the rejection observable', async () => {
    // If the implementation forgot to `await attachmentStorage.removeSubjectDir(...)`,
    // this rejection would become an unhandled promise rejection and
    // log.warn would never run — that is exactly the regression this test
    // catches.
    attachmentStorage = createAttachmentStorageMock({
      removeSubjectDir: vi.fn().mockRejectedValue(new Error('EBUSY: directory is locked'))
    })
    service = createMateriasService({ repository, attachmentStorage })

    const result = await service.deleteSubject(1)

    expect(logWarnMock).toHaveBeenCalledTimes(1)
    expect(logWarnMock.mock.calls[0]?.[0]).toContain('EBUSY')
    expect(result).toEqual({ deletedSlots: 1, deletedDeadlines: 1 })
  })
})
