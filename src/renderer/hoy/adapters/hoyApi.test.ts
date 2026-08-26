import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HoyApiError, hoyApi } from './hoyApi'

const sampleSubject = {
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
  regularity: null,
  slots: [{ id: 1, subjectId: 1, dayOfWeek: 1, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }]
}

const sampleMark = { id: 1, subjectId: 1, date: '2026-08-17', status: 'presente' }

const sampleNote = { id: 1, subjectId: 1, date: '2026-08-17', body: 'Round robin y starvation.' }

const sampleDeadline = {
  id: 1,
  subjectId: 1,
  title: 'TP 1',
  type: 'Trabajo práctico',
  dueAt: '2026-08-20T23:59',
  done: false,
  subjectName: 'Sistemas Operativos',
  subjectColor: '#4c8dff'
}

describe('hoyApi', () => {
  beforeEach(() => {
    // @ts-expect-error -- test-only global bridge stub, no full Electron preload context
    globalThis.window = {
      api: {
        hoy: { dashboard: vi.fn() },
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
        materias: {
          create: vi.fn(),
          list: vi.fn(),
          detail: vi.fn(),
          updateSchedule: vi.fn(),
          delete: vi.fn(),
          setOutcome: vi.fn()
        },
        finales: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        parciales: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        clases: {
          setAttendance: vi.fn(),
          clearAttendance: vi.fn(),
          saveNote: vi.fn(),
          deleteNote: vi.fn()
        },
        entregas: { create: vi.fn(), list: vi.fn(), update: vi.fn(), setDone: vi.fn(), delete: vi.fn() },
        adjuntos: { list: vi.fn(), add: vi.fn(), open: vi.fn(), remove: vi.fn(), read: vi.fn(), write: vi.fn() },
        indexado: { sync: vi.fn(), onStatusChanged: vi.fn().mockReturnValue(vi.fn()) },
        theme: { getPreference: vi.fn(), setPreference: vi.fn() },
        app: { openExternal: vi.fn(), exportJson: vi.fn(), onExportRequested: vi.fn() },
        ask: {
          question: vi.fn(),
          cancel: vi.fn(),
          listConversations: vi.fn(),
          getConversation: vi.fn(),
          deleteConversation: vi.fn()
        },
        cli: { probe: vi.fn(), setOverride: vi.fn(), preferences: vi.fn(), disconnect: vi.fn(), models: vi.fn() }
      }
    }
  })

  it('dashboard() parses and returns subjects, deadlines, marks and apuntes on a successful envelope', async () => {
    const payload = {
      subjects: [sampleSubject],
      deadlines: [sampleDeadline],
      attendance: [sampleMark],
      classNotes: [sampleNote]
    }
    window.api.hoy.dashboard = vi.fn().mockResolvedValue({ ok: true, data: payload })

    const result = await hoyApi.dashboard()

    expect(result).toEqual(payload)
  })

  it('dashboard() throws with the envelope error message when ok is false', async () => {
    window.api.hoy.dashboard = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'DASHBOARD_FAILED', message: 'database is locked' } })

    await expect(hoyApi.dashboard()).rejects.toThrow('database is locked')
  })

  // The renderer maps its Spanish copy off the CODE, never `message`
  // (`shared/lib/ipcErrorCopy.ts`) — so the throw must carry it, exactly
  // like `CarrerasApiError`/`AdjuntosApiError`.
  it('dashboard() throws a HoyApiError carrying the envelope code', async () => {
    window.api.hoy.dashboard = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'DASHBOARD_FAILED', message: 'database is locked' } })

    const error: unknown = await hoyApi.dashboard().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(HoyApiError)
    expect((error as HoyApiError).code).toBe('DASHBOARD_FAILED')
    expect((error as Error).message).toBe('database is locked')
  })
})
