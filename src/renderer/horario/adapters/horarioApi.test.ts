import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HorarioApiError, horarioApi } from './horarioApi'

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
  programId: null,
  nivel: null,
  outcome: null,
  grade: null,
  regularity: null,
  slots: [{ id: 1, subjectId: 1, dayOfWeek: 1, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }]
}

describe('horarioApi', () => {
  beforeEach(() => {
    // @ts-expect-error -- test-only global bridge stub, no full Electron preload context
    globalThis.window = {
      api: {
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
        cli: { probe: vi.fn(), setOverride: vi.fn(), preferences: vi.fn(), disconnect: vi.fn(), models: vi.fn() }
      }
    }
  })

  it('week() parses and returns the data array on a successful envelope', async () => {
    window.api.horario.week = vi.fn().mockResolvedValue({ ok: true, data: [sampleSubject] })

    const result = await horarioApi.week()

    expect(result).toEqual([sampleSubject])
  })

  it('week() throws with the envelope error message when ok is false', async () => {
    window.api.horario.week = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'WEEK_FAILED', message: 'database is locked' } })

    await expect(horarioApi.week()).rejects.toThrow('database is locked')
  })

  // The renderer maps its Spanish copy off the CODE, never `message`
  // (`shared/lib/ipcErrorCopy.ts`) — so the throw must carry it, exactly
  // like `CarrerasApiError`/`AdjuntosApiError`.
  it('week() throws a HorarioApiError carrying the envelope code', async () => {
    window.api.horario.week = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'WEEK_FAILED', message: 'database is locked' } })

    const error: unknown = await horarioApi.week().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(HorarioApiError)
    expect((error as HorarioApiError).code).toBe('WEEK_FAILED')
    expect((error as Error).message).toBe('database is locked')
  })
})
