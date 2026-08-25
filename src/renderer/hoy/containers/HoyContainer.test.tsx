// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardResult } from '../../../shared/ipc/hoy'
import type { SubjectWithStatus } from '../../../shared/ipc/materias'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { hoyApi } from '../adapters/hoyApi'
import { HoyContainer } from './HoyContainer'

vi.mock('../adapters/hoyApi', () => ({
  hoyApi: { dashboard: vi.fn() }
}))

vi.mock('../../materias/adapters/materiasApi', () => ({
  materiasApi: { list: vi.fn() }
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
      campusUrl: null,
      notas: null,
      attendanceMinPercent: null,
      periodId: null,
      outcome: null,
      grade: null,
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
  ]
}

// The ['materias'] facts the container filters against (outcome, period
// dates, finals) — the hoy:dashboard payload itself carries no period/finals.
function makeFacts(overrides: Partial<SubjectWithStatus> = {}): SubjectWithStatus {
  return { ...sampleData.subjects[0]!, period: null, program: null, finals: [], pendingDeadlines: 1, ...overrides }
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('HoyContainer (spec: "Today view on launch" — zero navigation)', () => {
  beforeEach(() => {
    vi.mocked(materiasApi.list).mockResolvedValue([makeFacts()])
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
    vi.mocked(hoyApi.dashboard).mockResolvedValue({ subjects: [], deadlines: sampleData.deadlines })

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
