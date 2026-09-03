import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MateriasApiError, materiasApi } from './materiasApi'

const sampleSubject = {
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

// `materias:list` now carries what the subject's status depends on.
const sampleSubjectWithStatus = {
  ...sampleSubject,
  period: null,
  program: null,
  finals: [],
  pendingDeadlines: 0,
  // Correlativas ride here as EDGES: the list already carries every subject's
  // state facts, so a consumer judges a requirement by looking the required
  // subject up in the same array.
  prerequisites: []
}

const sampleDetail = {
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

describe('materiasApi', () => {
  beforeEach(() => {
    // @ts-expect-error -- test-only global bridge stub, no full Electron preload context
    globalThis.window = {
      api: {
        materias: {
          create: vi.fn(),
          list: vi.fn(),
          detail: vi.fn(),
          updateSchedule: vi.fn(),
          delete: vi.fn(),
          setOutcome: vi.fn()
        },
        planificador: {
          list: vi.fn(),
          addPrerequisite: vi.fn(),
          updatePrerequisite: vi.fn(),
          removePrerequisite: vi.fn(),
          addEntry: vi.fn(),
          removeEntry: vi.fn()
        },
        horario: { week: vi.fn() },
        fechas: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        hoy: { dashboard: vi.fn() },
        carreras: {
          create: vi.fn(),
          list: vi.fn(),
          detail: vi.fn(),
          update: vi.fn(),
          createPeriod: vi.fn(),
          updatePeriod: vi.fn(),
          deletePeriod: vi.fn(),
          delete: vi.fn()
        },
        finales: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        clases: { setAttendance: vi.fn(), clearAttendance: vi.fn(), saveNote: vi.fn(), deleteNote: vi.fn() },
        parciales: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        entregas: { create: vi.fn(), list: vi.fn(), update: vi.fn(), setDone: vi.fn(), delete: vi.fn() },
        adjuntos: {
          list: vi.fn(),
          add: vi.fn(),
          open: vi.fn(),
          remove: vi.fn(),
          read: vi.fn(),
          write: vi.fn(),
          createDocument: vi.fn()
        },
        indexado: { sync: vi.fn(), onStatusChanged: vi.fn().mockReturnValue(vi.fn()) },
        theme: { getPreference: vi.fn(), setPreference: vi.fn(), getPalette: vi.fn(), setPalette: vi.fn() },
        app: { openExternal: vi.fn(), exportJson: vi.fn(), onExportRequested: vi.fn() },
        ask: {
          question: vi.fn(),
          cancel: vi.fn(),
          listConversations: vi.fn(),
          getConversation: vi.fn(),
          deleteConversation: vi.fn()
        },
        cli: { probe: vi.fn(), setOverride: vi.fn(), preferences: vi.fn(), disconnect: vi.fn(), models: vi.fn() },
        mcp: {
          status: vi.fn(),
          issueToken: vi.fn(),
          revokeToken: vi.fn(),
          setPermission: vi.fn(),
          listActivity: vi.fn(),
          onActivityChanged: vi.fn().mockReturnValue(vi.fn())
        }
      }
    }
  })

  it('list() parses and returns the data array on a successful envelope', async () => {
    window.api.materias.list = vi.fn().mockResolvedValue({ ok: true, data: [sampleSubjectWithStatus] })

    const result = await materiasApi.list()

    expect(result).toEqual([sampleSubjectWithStatus])
  })

  it('list() throws with the envelope error message when ok is false', async () => {
    window.api.materias.list = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'LIST_FAILED', message: 'database is locked' } })

    await expect(materiasApi.list()).rejects.toThrow('database is locked')
  })

  // The renderer maps its Spanish copy off the CODE, never `message`
  // (`shared/lib/ipcErrorCopy.ts`) — so the throw must carry it, exactly
  // like `CarrerasApiError`/`AdjuntosApiError`.
  it('list() throws a MateriasApiError carrying the envelope code', async () => {
    window.api.materias.list = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'LIST_FAILED', message: 'database is locked' } })

    const error: unknown = await materiasApi.list().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(MateriasApiError)
    expect((error as MateriasApiError).code).toBe('LIST_FAILED')
    expect((error as Error).message).toBe('database is locked')
  })

  it('create() forwards the input and parses the returned subject', async () => {
    const createInput = {
      name: 'Algoritmos',
      code: 'ALG-101',
      color: '#7c3aed',
      periodId: 7,
      slots: [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: null }]
    }
    window.api.materias.create = vi.fn().mockResolvedValue({ ok: true, data: sampleSubject })

    const result = await materiasApi.create(createInput)

    expect(window.api.materias.create).toHaveBeenCalledWith(createInput)
    expect(result).toEqual(sampleSubject)
  })

  it('create() throws with the envelope error message when ok is false', async () => {
    window.api.materias.create = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'name is required' } })

    await expect(materiasApi.create({ name: '', code: '', color: '', periodId: 7, slots: [] })).rejects.toThrow(
      'name is required'
    )
  })

  it('detail() forwards the id and parses the aggregated subject+slots+deadlines', async () => {
    window.api.materias.detail = vi.fn().mockResolvedValue({ ok: true, data: sampleDetail })

    const result = await materiasApi.detail(1)

    expect(window.api.materias.detail).toHaveBeenCalledWith(1)
    expect(result).toEqual(sampleDetail)
  })

  it('detail() throws with the envelope error message when ok is false', async () => {
    window.api.materias.detail = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: 'No subject with id 999' } })

    await expect(materiasApi.detail(999)).rejects.toThrow('No subject with id 999')
  })

  it('updateSchedule() forwards the input and parses the returned subject', async () => {
    const updateInput = {
      id: 1,
      name: 'Algoritmos I',
      code: 'ALG-101',
      color: '#7c3aed',
      slots: [{ dayOfWeek: 2, startMinutes: 480, endMinutes: 540, location: null }]
    }
    window.api.materias.updateSchedule = vi.fn().mockResolvedValue({ ok: true, data: sampleSubject })

    const result = await materiasApi.updateSchedule(updateInput)

    expect(window.api.materias.updateSchedule).toHaveBeenCalledWith(updateInput)
    expect(result).toEqual(sampleSubject)
  })

  it('updateSchedule() throws with the envelope error message when ok is false', async () => {
    window.api.materias.updateSchedule = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'name is required' } })

    await expect(materiasApi.updateSchedule({ id: 1, name: '', code: '', color: '', slots: [] })).rejects.toThrow(
      'name is required'
    )
  })

  it('delete() forwards the id and parses the deleted counts', async () => {
    window.api.materias.delete = vi.fn().mockResolvedValue({ ok: true, data: { deletedSlots: 3, deletedDeadlines: 7 } })

    const result = await materiasApi.delete(1)

    expect(window.api.materias.delete).toHaveBeenCalledWith(1)
    expect(result).toEqual({ deletedSlots: 3, deletedDeadlines: 7 })
  })

  it('delete() throws with the envelope error message when ok is false', async () => {
    window.api.materias.delete = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: 'No subject with id 999' } })

    await expect(materiasApi.delete(999)).rejects.toThrow('No subject with id 999')
  })
})
