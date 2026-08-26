// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import type { SubjectWithStatus } from '../../../shared/ipc/materias'
import type { PlannerEntryRecord } from '../../../shared/ipc/planificador'
import { carrerasApi } from '../../carreras/adapters/carrerasApi'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { planificadorApi } from '../adapters/planificadorApi'
import { PlanificadorContainer } from './PlanificadorContainer'

vi.mock('../adapters/planificadorApi', () => ({
  planificadorApi: { list: vi.fn(), addEntry: vi.fn(), removeEntry: vi.fn() }
}))

vi.mock('../../materias/adapters/materiasApi', () => ({
  materiasApi: { list: vi.fn() }
}))

vi.mock('../../carreras/adapters/carrerasApi', () => ({
  carrerasApi: { list: vi.fn() }
}))

const NOW = new Date('2026-09-15T10:00:00')
const MONDAY = 1
const WEDNESDAY = 3

let nextSlotId = 1

function slot(subjectId: number, dayOfWeek: number, startMinutes: number, endMinutes: number) {
  return { id: nextSlotId++, subjectId, dayOfWeek, startMinutes, endMinutes, location: null }
}

function subject(overrides: Partial<SubjectWithStatus> & { id: number; name: string }): SubjectWithStatus {
  return {
    code: `COD-${overrides.id}`,
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
    slots: [],
    period: null,
    program: null,
    finals: [],
    pendingDeadlines: 0,
    prerequisites: [],
    ...overrides
  }
}

const PROGRAMS: ProgramWithPeriods[] = [
  {
    id: 1,
    name: 'Ingeniería',
    institution: null,
    color: '#fff',
    gradingScheme: 'numerico',
    gradeScale: 10,
    periods: [
      {
        id: 10,
        programId: 1,
        name: '2do Cuatri 2026',
        kind: 'cuatrimestre',
        startsOn: '2026-08-01',
        endsOn: '2026-12-20'
      },
      {
        id: 11,
        programId: 1,
        name: '1er Cuatri 2027',
        kind: 'cuatrimestre',
        startsOn: '2027-03-01',
        endsOn: '2027-07-31'
      }
    ],
    subjectCount: 0,
    gradedSubjects: []
  }
]

function renderContainer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <PlanificadorContainer now={NOW} />
    </QueryClientProvider>
  )
  return queryClient
}

describe('PlanificadorContainer', () => {
  beforeEach(() => {
    vi.mocked(carrerasApi.list).mockResolvedValue(PROGRAMS)
    vi.mocked(planificadorApi.list).mockResolvedValue([])
    vi.mocked(materiasApi.list).mockResolvedValue([])
    vi.mocked(planificadorApi.addEntry).mockResolvedValue({ id: 1, periodId: 11, subjectId: 1 })
    vi.mocked(planificadorApi.removeEntry).mockResolvedValue({ periodId: 11, subjectId: 1 })
  })

  it('reports a failed load without pretending the draft is empty', async () => {
    vi.mocked(materiasApi.list).mockRejectedValue(new Error('nope'))
    renderContainer()

    expect(await screen.findByText('No se pudo cargar el planificador.')).toBeInTheDocument()
  })

  // The UPCOMING período leads: the screen is about what comes next, so the
  // cuatrimestre running today is offered but never preselected over it.
  it('opens on the first upcoming período', async () => {
    renderContainer()

    const switcher = await screen.findByRole('combobox', { name: 'Período que estás planificando' })

    expect(switcher).toHaveValue('11')
  })

  it('resolves eligibility from the correlativas on the subject list', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([
      subject({ id: 1, name: 'Algoritmos I' }),
      subject({
        id: 2,
        name: 'Estructuras de Datos',
        prerequisites: [{ requiresSubjectId: 1, requiredLevel: 'aprobada' }]
      })
    ])
    renderContainer()

    expect(await screen.findByText('Falta Algoritmos I aprobada')).toBeInTheDocument()
    expect(screen.getByText('Habilitada')).toBeInTheDocument()
  })

  it('drafts a materia into the período being planned', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([subject({ id: 1, name: 'Física I' })])
    renderContainer()

    await userEvent.click(await screen.findByRole('button', { name: 'Agregar Física I al borrador' }))

    // The FIRST argument only: TanStack Query v5 passes a second context
    // argument to every mutationFn, so `toHaveBeenCalledWith` would fail on an
    // argument this app never sends (same idiom EntregasContainer's tests use).
    await waitFor(() => expect(planificadorApi.addEntry).toHaveBeenCalledTimes(1))
    expect(vi.mocked(planificadorApi.addEntry).mock.calls[0]?.[0]).toEqual({ periodId: 11, subjectId: 1 })
  })

  // Draft lines are scoped to the período being planned: a materia drafted for
  // a different cuatrimestre is still a candidate for this one.
  it('shows only the draft of the selected período', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([
      subject({ id: 1, name: 'Física I' }),
      subject({ id: 2, name: 'Química' })
    ])
    const entries: PlannerEntryRecord[] = [
      { id: 1, periodId: 11, subjectId: 1 },
      { id: 2, periodId: 10, subjectId: 2 }
    ]
    vi.mocked(planificadorApi.list).mockResolvedValue(entries)
    renderContainer()

    const draftSection = await screen.findByRole('region', { name: 'TU BORRADOR' })
    const candidatesSection = screen.getByRole('region', { name: 'DISPONIBLES PARA CURSAR' })

    await waitFor(() => {
      expect(draftSection.textContent).toContain('Física I')
    })
    expect(draftSection.textContent).not.toContain('Química')
    expect(candidatesSection.textContent).toContain('Química')
    expect(candidatesSection.textContent).not.toContain('Física I')
  })

  it('takes a materia back out of the draft', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([subject({ id: 1, name: 'Física I' })])
    vi.mocked(planificadorApi.list).mockResolvedValue([{ id: 1, periodId: 11, subjectId: 1 }])
    renderContainer()

    await userEvent.click(await screen.findByRole('button', { name: 'Sacar Física I del borrador' }))

    await waitFor(() => expect(planificadorApi.removeEntry).toHaveBeenCalledTimes(1))
    expect(vi.mocked(planificadorApi.removeEntry).mock.calls[0]?.[0]).toEqual({ periodId: 11, subjectId: 1 })
  })

  it('detects a clash between two drafted materias', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([
      subject({ id: 1, name: 'Análisis Matemático II', slots: [slot(1, WEDNESDAY, 1080, 1260)] }),
      subject({ id: 2, name: 'Redes de Computadoras', slots: [slot(2, WEDNESDAY, 1140, 1320)] })
    ])
    vi.mocked(planificadorApi.list).mockResolvedValue([
      { id: 1, periodId: 11, subjectId: 1 },
      { id: 2, periodId: 11, subjectId: 2 }
    ])
    renderContainer()

    expect(await screen.findByText('Análisis Matemático II se superpone con Redes de Computadoras')).toBeInTheDocument()
  })

  it('reads the weekly load off the drafted materias', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([
      subject({ id: 1, name: 'Análisis', slots: [slot(1, MONDAY, 1080, 1260), slot(1, WEDNESDAY, 1080, 1260)] })
    ])
    vi.mocked(planificadorApi.list).mockResolvedValue([{ id: 1, periodId: 11, subjectId: 1 }])
    renderContainer()

    expect(await screen.findByText('1 materia · 2 clases por semana')).toBeInTheDocument()
  })

  it('switches the período being planned', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([subject({ id: 1, name: 'Física I' })])
    vi.mocked(planificadorApi.list).mockResolvedValue([{ id: 1, periodId: 10, subjectId: 1 }])
    renderContainer()

    const switcher = await screen.findByRole('combobox', { name: 'Período que estás planificando' })
    await userEvent.selectOptions(switcher, '10')

    expect(await screen.findByRole('button', { name: 'Sacar Física I del borrador' })).toBeInTheDocument()
  })

  it('explains itself when every período has already finished', async () => {
    vi.mocked(carrerasApi.list).mockResolvedValue([
      {
        ...PROGRAMS[0]!,
        periods: [
          { id: 9, programId: 1, name: 'Viejo', kind: 'cuatrimestre', startsOn: '2025-03-01', endsOn: '2025-07-31' }
        ]
      }
    ])
    renderContainer()

    expect(await screen.findByText('Todavía no hay ningún período por delante')).toBeInTheDocument()
  })
})
