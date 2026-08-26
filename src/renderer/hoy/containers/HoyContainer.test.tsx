// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AcademicDateWithProgram } from '../../../shared/ipc/fechas'
import type { DashboardResult } from '../../../shared/ipc/hoy'
import type { SubjectWithStatus } from '../../../shared/ipc/materias'
import { clasesApi } from '../../clases/adapters/clasesApi'
import { fechasApi } from '../../fechas/adapters/fechasApi'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { hoyApi } from '../adapters/hoyApi'
import { HoyContainer } from './HoyContainer'

vi.mock('../adapters/hoyApi', () => ({
  hoyApi: { dashboard: vi.fn() }
}))

vi.mock('../../materias/adapters/materiasApi', () => ({
  materiasApi: { list: vi.fn() }
}))

vi.mock('../../clases/adapters/clasesApi', () => ({
  clasesApi: { setAttendance: vi.fn(), clearAttendance: vi.fn(), saveNote: vi.fn(), deleteNote: vi.fn() }
}))

vi.mock('../../fechas/adapters/fechasApi', () => ({
  fechasApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
}))

beforeAll(() => {
  process.env.TZ = 'America/New_York'
})

const sampleData: DashboardResult = {
  subjects: [
    {
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
      slots: [{ id: 1, subjectId: 1, dayOfWeek: 4, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }]
    }
  ],
  deadlines: [
    {
      id: 1,
      subjectId: 1,
      title: 'TP 1',
      type: 'Trabajo práctico',
      dueAt: '2026-08-12T23:59', // overdue relative to the fixed "now" below
      done: false,
      subjectName: 'Sistemas Operativos',
      subjectColor: '#4c8dff'
    }
  ],
  attendance: [],
  classNotes: []
}

// The ['materias'] facts the container filters against (outcome, period
// dates, finals) — the hoy:dashboard payload itself carries no period/finals.
function makeFacts(overrides: Partial<SubjectWithStatus> = {}): SubjectWithStatus {
  return {
    ...sampleData.subjects[0]!,
    period: null,
    program: null,
    finals: [],
    pendingDeadlines: 1,
    prerequisites: [],
    ...overrides
  }
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('HoyContainer (spec: "Today view on launch" — zero navigation)', () => {
  beforeEach(() => {
    vi.mocked(materiasApi.list).mockResolvedValue([makeFacts()])
    vi.mocked(fechasApi.list).mockResolvedValue([])
  })

  it('fetches on the ["hoy","dashboard"] query key and renders today\'s class + overdue deadline with zero clicks', async () => {
    vi.mocked(hoyApi.dashboard).mockResolvedValue(sampleData)

    renderWithClient(<HoyContainer now={new Date(2026, 7, 13, 9, 0)} />)

    await waitFor(() => expect(hoyApi.dashboard).toHaveBeenCalledTimes(1))
    expect(await screen.findAllByText('Sistemas Operativos')).toHaveLength(2) // class row + overdue deadline's subject tag
    expect(screen.getByText('TP 1')).toBeInTheDocument()
    expect(screen.getByText(/1 día de atraso/)).toBeInTheDocument()
  })

  it('surfaces an overdue deadline even when it is outside the classes list entirely (editor/viewer consistency)', async () => {
    vi.mocked(hoyApi.dashboard).mockResolvedValue({
      subjects: [],
      deadlines: sampleData.deadlines,
      attendance: [],
      classNotes: []
    })

    renderWithClient(<HoyContainer now={new Date(2026, 7, 13, 9, 0)} />)

    expect(await screen.findByText('TP 1')).toBeInTheDocument()
  })

  // A closed subject neither attends classes nor owes deliverables — its
  // slots and deadlines both disappear from the dashboard.
  it('hides both the class and the deadline of a closed subject', async () => {
    vi.mocked(hoyApi.dashboard).mockResolvedValue(sampleData)
    vi.mocked(materiasApi.list).mockResolvedValue([makeFacts({ outcome: 'aprobada' })])

    renderWithClient(<HoyContainer now={new Date(2026, 7, 13, 9, 0)} />)

    expect(await screen.findByText('Hoy no tenés clases')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('TP 1')).not.toBeInTheDocument())
    expect(screen.queryByText('Sistemas Operativos')).not.toBeInTheDocument()
  })

  // "Sin cerrar" = the period ended but the student never closed the
  // subject: no class to attend anymore, but work may still be owed.
  it('keeps the deadlines of a sin-cerrar subject while dropping its classes', async () => {
    vi.mocked(hoyApi.dashboard).mockResolvedValue(sampleData)
    vi.mocked(materiasApi.list).mockResolvedValue([
      makeFacts({ period: { id: 1, name: '1C 2026', startsOn: '2026-03-09', endsOn: '2026-07-18' } })
    ])

    renderWithClient(<HoyContainer now={new Date(2026, 7, 13, 9, 0)} />)

    expect(await screen.findByText('TP 1')).toBeInTheDocument()
    // The subject name survives only as the deadline's subject tag, never as a class row.
    await waitFor(() => expect(screen.getAllByText('Sistemas Operativos')).toHaveLength(1))
  })
})

// The callout is the ONE thing Hoy says about a trámite: it is not a list,
// it is a warning that something with a deadline is about to close.
describe('HoyContainer — the administrative-date callout', () => {
  const now = new Date(2026, 7, 13, 9, 0)

  function makeAcademicDate(overrides: Partial<AcademicDateWithProgram> = {}): AcademicDateWithProgram {
    return {
      id: 1,
      programId: 2,
      title: 'Inscripción a finales',
      kind: 'inscripcionFinales',
      startsOn: '2026-08-12',
      endsOn: '2026-08-16',
      programName: 'Abogacía',
      ...overrides
    }
  }

  beforeEach(() => {
    vi.mocked(materiasApi.list).mockResolvedValue([makeFacts()])
    vi.mocked(hoyApi.dashboard).mockResolvedValue(sampleData)
  })

  it('warns about the nearest date closing inside the next 7 days', async () => {
    vi.mocked(fechasApi.list).mockResolvedValue([makeAcademicDate()])

    renderWithClient(<HoyContainer now={now} />)

    expect(await screen.findByText('Inscripción a finales — cierra en 3 días')).toBeInTheDocument()
    expect(screen.getByText('Del 12 al 16 de agosto · Abogacía')).toBeInTheDocument()
  })

  it('warns about the most urgent one when several are near', async () => {
    vi.mocked(fechasApi.list).mockResolvedValue([
      makeAcademicDate({ id: 1, title: 'La lejana', startsOn: '2026-08-18', endsOn: '2026-08-19' }),
      makeAcademicDate({ id: 2, title: 'La urgente', startsOn: '2026-08-13', endsOn: '2026-08-14' })
    ])

    renderWithClient(<HoyContainer now={now} />)

    expect(await screen.findByText('La urgente — cierra mañana')).toBeInTheDocument()
    expect(screen.queryByText(/La lejana/)).not.toBeInTheDocument()
  })

  it('stays hidden when the nearest date is still far away', async () => {
    vi.mocked(fechasApi.list).mockResolvedValue([
      makeAcademicDate({ startsOn: '2026-11-01', endsOn: '2026-11-05', title: 'Muy lejos' })
    ])

    renderWithClient(<HoyContainer now={now} />)

    await screen.findByText('TP 1')
    expect(screen.queryByText(/Muy lejos/)).not.toBeInTheDocument()
  })

  it('stays hidden when a near date has already passed', async () => {
    vi.mocked(fechasApi.list).mockResolvedValue([
      makeAcademicDate({ startsOn: '2026-08-08', endsOn: '2026-08-11', title: 'Ya cerró' })
    ])

    renderWithClient(<HoyContainer now={now} />)

    await screen.findByText('TP 1')
    expect(screen.queryByText(/Ya cerró/)).not.toBeInTheDocument()
  })

  it('stays hidden when there are no administrative dates at all', async () => {
    vi.mocked(fechasApi.list).mockResolvedValue([])

    renderWithClient(<HoyContainer now={now} />)

    await screen.findByText('TP 1')
    expect(screen.queryByText(/cierra en/i)).not.toBeInTheDocument()
  })
})

// Hoy stopped being a pure read-model here, deliberately and narrowly: the
// day's own list is where you know whether you were in the class. The writes
// still go through `clases:*`, and they are anchored to `(subjectId, date)`
// with the date being TODAY — resolved from the injected clock, never from a
// slot id and never from a payload main filtered.
describe('HoyContainer — marking today`s classes', () => {
  const now = new Date(2026, 7, 13, 9, 0) // Thursday 2026-08-13

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(materiasApi.list).mockResolvedValue([makeFacts()])
    vi.mocked(fechasApi.list).mockResolvedValue([])
    vi.mocked(clasesApi.setAttendance).mockResolvedValue({
      id: 1,
      subjectId: 1,
      date: '2026-08-13',
      status: 'presente'
    })
    vi.mocked(clasesApi.clearAttendance).mockResolvedValue({ subjectId: 1, date: '2026-08-13' })
  })

  it('records a mark against the subject and TODAY`s local date', async () => {
    vi.mocked(hoyApi.dashboard).mockResolvedValue(sampleData)

    renderWithClient(<HoyContainer now={now} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Marcar presente en Sistemas Operativos' }))

    await waitFor(() =>
      expect(clasesApi.setAttendance).toHaveBeenCalledWith({ subjectId: 1, date: '2026-08-13', status: 'presente' })
    )
  })

  it('shows the stored mark on the row and clears it when the active control is pressed again', async () => {
    vi.mocked(hoyApi.dashboard).mockResolvedValue({
      ...sampleData,
      attendance: [{ id: 1, subjectId: 1, date: '2026-08-13', status: 'presente' }]
    })

    renderWithClient(<HoyContainer now={now} />)

    const presente = await screen.findByRole('button', { name: 'Marcar presente en Sistemas Operativos' })
    expect(presente).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(presente)

    await waitFor(() => expect(clasesApi.clearAttendance).toHaveBeenCalledWith({ subjectId: 1, date: '2026-08-13' }))
  })

  // A mark recorded on another day belongs to another class: the join key is
  // the pair, and the row must not borrow yesterday's answer.
  it('ignores a mark stored under a different date', async () => {
    vi.mocked(hoyApi.dashboard).mockResolvedValue({
      ...sampleData,
      attendance: [{ id: 1, subjectId: 1, date: '2026-08-06', status: 'presente' }]
    })

    renderWithClient(<HoyContainer now={now} />)

    expect(await screen.findByRole('button', { name: 'Marcar presente en Sistemas Operativos' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('opens the class dialog for today from the apunte control, prefilled with the stored apunte', async () => {
    vi.mocked(hoyApi.dashboard).mockResolvedValue({
      ...sampleData,
      classNotes: [{ id: 1, subjectId: 1, date: '2026-08-13', body: 'Round robin y starvation.' }]
    })

    renderWithClient(<HoyContainer now={now} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Apunte de la clase de Sistemas Operativos' }))

    expect(await screen.findByRole('dialog', { name: 'Clase del jueves 13 de agosto' })).toBeInTheDocument()
    expect(screen.getByLabelText('APUNTE DE LA CLASE')).toHaveValue('Round robin y starvation.')
  })
})
