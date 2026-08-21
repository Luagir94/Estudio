import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hoyApi } from './hoyApi'

const sampleSubject = {
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
        horario: { week: vi.fn() },
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
        entregas: { create: vi.fn(), list: vi.fn(), update: vi.fn(), setDone: vi.fn(), delete: vi.fn() },
        adjuntos: { list: vi.fn(), add: vi.fn(), open: vi.fn(), remove: vi.fn() },
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

  it('dashboard() parses and returns { subjects, deadlines } on a successful envelope', async () => {
    window.api.hoy.dashboard = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { subjects: [sampleSubject], deadlines: [sampleDeadline] } })

    const result = await hoyApi.dashboard()

    expect(result).toEqual({ subjects: [sampleSubject], deadlines: [sampleDeadline] })
  })

  it('dashboard() throws with the envelope error message when ok is false', async () => {
    window.api.hoy.dashboard = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'DASHBOARD_FAILED', message: 'database is locked' } })

    await expect(hoyApi.dashboard()).rejects.toThrow('database is locked')
  })
})
