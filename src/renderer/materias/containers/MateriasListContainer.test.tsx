// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectWithStatus } from '../../../shared/ipc/materias'
import { MateriasListContainer } from './MateriasListContainer'

const { materiasApiMock } = vi.hoisted(() => ({
  materiasApiMock: {
    list: vi.fn(),
    create: vi.fn(),
    detail: vi.fn(),
    updateSchedule: vi.fn(),
    delete: vi.fn(),
    setOutcome: vi.fn()
  }
}))

const { carrerasApiMock } = vi.hoisted(() => ({
  carrerasApiMock: { list: vi.fn(), create: vi.fn(), detail: vi.fn(), createPeriod: vi.fn(), delete: vi.fn() }
}))

vi.mock('../adapters/materiasApi', () => ({ materiasApi: materiasApiMock }))
vi.mock('../../carreras/adapters/carrerasApi', () => ({ carrerasApi: carrerasApiMock }))

const today = new Date(2026, 7, 15)

const activePeriod = { id: 2, name: '2do Cuatrimestre 2026', startsOn: '2026-08-12', endsOn: '2026-12-04' }
const finishedPeriod = { id: 1, name: '1er Cuatrimestre 2026', startsOn: '2026-03-09', endsOn: '2026-07-18' }
const numericProgram = { id: 1, name: 'Abogacía', gradingScheme: 'numerico' as const, gradeScale: 10 }

function subject(overrides: Partial<SubjectWithStatus> & { id: number; name: string }): SubjectWithStatus {
  return {
    code: 'XX-000',
    color: '#4c8dff',
    docente: null,
    contacto: null,
    comision: null,
    aula: null,
    campusUrl: null,
    groupUrl: null,
    notas: null,
    attendanceMinPercent: null,
    periodId: 2,
    outcome: null,
    grade: null,
    slots: [],
    period: activePeriod,
    program: numericProgram,
    finals: [],
    pendingDeadlines: 0,
    ...overrides
  }
}

const cursando = subject({ id: 1, name: 'Derecho Constitucional' })
const sinCerrar = subject({ id: 2, name: 'Derecho Romano', periodId: 1, period: finishedPeriod })
const aprobada = subject({
  id: 3,
  name: 'Historia del Derecho',
  periodId: 1,
  period: finishedPeriod,
  outcome: 'aprobada',
  grade: 8
})
const standby = subject({
  id: 4,
  name: 'Teoría del Estado',
  periodId: 1,
  period: finishedPeriod,
  outcome: 'finalPendiente',
  finals: [{ result: 'reprobado' }]
})

function renderContainer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MateriasListContainer now={today} />
    </QueryClientProvider>
  )
}

describe('MateriasListContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    materiasApiMock.list.mockResolvedValue([cursando, sinCerrar, aprobada, standby])
    materiasApiMock.setOutcome.mockResolvedValue({ ...sinCerrar, outcome: 'aprobada', grade: 7 })
  })

  it('defaults to the subjects being taken right now', async () => {
    renderContainer()

    expect(await screen.findByText('Derecho Constitucional')).toBeInTheDocument()
    expect(screen.queryByText('Historia del Derecho')).not.toBeInTheDocument()
    expect(screen.queryByText('Teoría del Estado')).not.toBeInTheDocument()
  })

  it('counts every filter, not just the selected one', async () => {
    renderContainer()
    await screen.findByText('Derecho Constitucional')

    expect(screen.getByRole('button', { name: 'Activas 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Final pendiente 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprobadas 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sin cerrar 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todas 4' })).toBeInTheDocument()
  })

  it('switches the visible subjects when the filter changes', async () => {
    renderContainer()
    await screen.findByText('Derecho Constitucional')

    await userEvent.click(screen.getByRole('button', { name: 'Final pendiente 1' }))

    expect(screen.getByText('Teoría del Estado')).toBeInTheDocument()
    expect(screen.queryByText('Derecho Constitucional')).not.toBeInTheDocument()
  })

  it('does not count a standby subject as active', async () => {
    renderContainer()
    await screen.findByText('Derecho Constitucional')

    expect(screen.getByRole('button', { name: 'Activas 1' })).toBeInTheDocument()
  })

  // The app still ASKS — the `Sin cerrar` chip is how it asks — but it asks
  // here and answers in the subject DETAIL. The old banner offered the only
  // close action in the app and appeared only once a período had ENDED,
  // which made closing a subject impossible during the cursada and took the
  // finales flow (reached through `finalPendiente`) down with it.
  it('still counts the subjects left unclosed', async () => {
    renderContainer()
    await screen.findByText('Derecho Constitucional')

    expect(screen.getByRole('button', { name: 'Sin cerrar 1' })).toBeInTheDocument()
  })

  it('offers no way to close a subject — that lives in the subject detail', async () => {
    renderContainer()
    await screen.findByText('Derecho Constitucional')

    expect(screen.queryByText(/quedó sin cerrar/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cerrar/ })).not.toBeInTheDocument()
    expect(materiasApiMock.setOutcome).not.toHaveBeenCalled()
  })

  it('reports a failed fetch', async () => {
    materiasApiMock.list.mockRejectedValue(new Error('boom'))

    renderContainer()

    expect(await screen.findByText('No se pudieron cargar las materias.')).toBeInTheDocument()
  })
})

// The período picker: the schema always accepted `periodId`, but until now
// no form offered it, so every subject landed unassigned.
describe('MateriasListContainer — período picker', () => {
  const programs = [
    {
      id: 1,
      name: 'Abogacía',
      institution: null,
      color: '#4C8DFF',
      gradingScheme: 'numerico' as const,
      gradeScale: 10,
      periods: [
        {
          id: 2,
          programId: 1,
          name: '2do Cuatrimestre 2026',
          kind: 'cuatrimestre',
          startsOn: '2026-08-12',
          endsOn: '2026-12-04'
        }
      ],
      subjectCount: 0,
      gradedSubjects: []
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    materiasApiMock.list.mockResolvedValue([cursando])
    carrerasApiMock.list.mockResolvedValue(programs)
    materiasApiMock.create.mockResolvedValue(cursando)
  })

  async function openCreateForm() {
    renderContainer()
    await screen.findByText('Derecho Constitucional')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar materia' }))
  }

  it('offers the periods of every carrera', async () => {
    await openCreateForm()

    expect(await screen.findByRole('option', { name: '2do Cuatrimestre 2026' })).toBeInTheDocument()
  })

  it('pre-selects the active period so the usual case needs no click', async () => {
    await openCreateForm()

    const select = (await screen.findByLabelText('PERÍODO')) as HTMLSelectElement
    expect(select.value).toBe('2')
  })

  it('leaves the picker empty when no period is active', async () => {
    carrerasApiMock.list.mockResolvedValue([
      { ...programs[0]!, periods: [{ ...programs[0]!.periods[0]!, startsOn: '2025-03-09', endsOn: '2025-07-18' }] }
    ])

    await openCreateForm()

    const select = (await screen.findByLabelText('PERÍODO')) as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('sends the chosen period with the new subject', async () => {
    await openCreateForm()

    await userEvent.type(screen.getByLabelText('NOMBRE'), 'Derecho Penal')
    await userEvent.type(screen.getByLabelText('CÓDIGO'), 'DP-210')
    await userEvent.click(screen.getByRole('button', { name: 'Color #4C8DFF' }))
    await userEvent.selectOptions(await screen.findByLabelText('PERÍODO'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar horario' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear materia' }))

    await waitFor(() => {
      expect(materiasApiMock.create.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ periodId: 2 }))
    })
  })

  // Creating a subject without a period is no longer possible: it would
  // belong to no carrera, never leave "cursando" and count toward no
  // average. The option is gone from the form, not merely un-defaulted.
  it('offers no way to create a subject without a period', async () => {
    await openCreateForm()

    await screen.findByLabelText('PERÍODO')

    expect(screen.queryByRole('option', { name: 'Sin período' })).not.toBeInTheDocument()
  })

  it('blocks the form entirely when no period exists yet, and says why', async () => {
    carrerasApiMock.list.mockResolvedValue([])

    await openCreateForm()

    expect(await screen.findByText('Todavía no tenés ningún período cargado')).toBeInTheDocument()
    expect(screen.queryByLabelText('NOMBRE')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear materia' })).not.toBeInTheDocument()
  })

  // The dead end used to offer only "Entendido" — a body that says "go to
  // Carreras" next to a button that just dismisses. "Ir a Carreras" now
  // actually takes the user there, and closes this modal on the way out.
  it('offers a way out of the no-period dead end that actually navigates to Carreras', async () => {
    carrerasApiMock.list.mockResolvedValue([])
    const onGoToCarreras = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MateriasListContainer now={today} onGoToCarreras={onGoToCarreras} />
      </QueryClientProvider>
    )
    await screen.findByText('Derecho Constitucional')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar materia' }))
    await screen.findByText('Todavía no tenés ningún período cargado')

    await userEvent.click(screen.getByRole('button', { name: 'Ir a Carreras' }))

    expect(onGoToCarreras).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

// Onboarding empty state (approved design): ZERO subjects overall is a
// different situation from "the current filter matched none" — the first
// gets the designed onboarding card with its two CTAs, the second keeps the
// existing filtered-empty wording.
describe('MateriasListContainer — onboarding empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    materiasApiMock.list.mockResolvedValue([])
    carrerasApiMock.list.mockResolvedValue([])
  })

  function renderEmpty(onGoToCarreras = vi.fn()) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MateriasListContainer now={today} onGoToCarreras={onGoToCarreras} />
      </QueryClientProvider>
    )
    return { onGoToCarreras }
  }

  it('renders the onboarding card when zero subjects exist, hiding the filter chips', async () => {
    renderEmpty()

    expect(await screen.findByText('Todavía no cargaste materias')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filtrar por estado' })).not.toBeInTheDocument()
    expect(screen.queryByText(/no hay materias que coincidan/i)).not.toBeInTheDocument()
  })

  it('opens the existing NuevaMateriaModal flow from the primary CTA', async () => {
    renderEmpty()
    await screen.findByText('Todavía no cargaste materias')

    // Two entry points share the label: the header button and the CTA. The
    // CTA is the one inside the onboarding card — the last in DOM order.
    const buttons = screen.getAllByRole('button', { name: 'Agregar materia' })
    await userEvent.click(buttons[buttons.length - 1]!)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('navigates to Carreras from the secondary CTA', async () => {
    const { onGoToCarreras } = renderEmpty()
    await screen.findByText('Todavía no cargaste materias')

    await userEvent.click(screen.getByRole('button', { name: 'Configurar carrera' }))

    expect(onGoToCarreras).toHaveBeenCalledTimes(1)
  })

  it('keeps the filtered-empty wording when subjects exist but the filter hides them all', async () => {
    materiasApiMock.list.mockResolvedValue([aprobada]) // default filter is "activas"

    renderEmpty()

    expect(await screen.findByText(/no hay materias que coincidan/i)).toBeInTheDocument()
    expect(screen.queryByText('Todavía no cargaste materias')).not.toBeInTheDocument()
  })
})
