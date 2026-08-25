// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import type { SubjectWithStatus } from '../../../shared/ipc/materias'
import { PeriodDetailContainer } from './PeriodDetailContainer'

const { carrerasApiMock } = vi.hoisted(() => ({
  carrerasApiMock: {
    list: vi.fn(),
    create: vi.fn(),
    detail: vi.fn(),
    update: vi.fn(),
    createPeriod: vi.fn(),
    updatePeriod: vi.fn(),
    deletePeriod: vi.fn(),
    delete: vi.fn()
  }
}))

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

vi.mock('../adapters/carrerasApi', () => ({ carrerasApi: carrerasApiMock }))
vi.mock('../../materias/adapters/materiasApi', () => ({ materiasApi: materiasApiMock }))

const today = new Date(2026, 7, 15)

const abogacia: ProgramWithPeriods = {
  id: 1,
  name: 'Abogacía',
  institution: 'Universidad de Buenos Aires',
  color: '#4C8DFF',
  gradingScheme: 'numerico',
  gradeScale: 10,
  periods: [
    {
      id: 1,
      programId: 1,
      name: '1er cuatrimestre',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-18'
    },
    {
      id: 2,
      programId: 1,
      name: '2do cuatrimestre',
      kind: 'cuatrimestre',
      startsOn: '2026-08-12',
      endsOn: '2026-12-04'
    }
  ],
  subjectCount: 2,
  gradedSubjects: []
}

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
    period: { id: 2, name: '2do cuatrimestre', startsOn: '2026-08-12', endsOn: '2026-12-04' },
    program: { id: 1, name: 'Abogacía', gradingScheme: 'numerico', gradeScale: 10 },
    finals: [],
    pendingDeadlines: 0,
    ...overrides
  }
}

const propia = subject({ id: 1, name: 'Derecho Penal' })
const otroPeriodo = subject({
  id: 2,
  name: 'Derecho Constitucional',
  periodId: 1,
  period: { id: 1, name: '1er cuatrimestre', startsOn: '2026-03-09', endsOn: '2026-07-18' }
})

function renderDetail(props: Partial<{ onBack: () => void; onOpenSubject: (id: number) => void }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PeriodDetailContainer
        programId={1}
        periodId={2}
        onBack={props.onBack ?? vi.fn()}
        onOpenSubject={props.onOpenSubject}
        now={today}
      />
    </QueryClientProvider>
  )
}

describe('PeriodDetailContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([propia, otroPeriodo])
  })

  it('shows the period, not the carrera', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { name: '2do cuatrimestre' })).toBeInTheDocument()
  })

  // The same sentence the periods table prints, for the same reason: it is
  // the app explaining why no screen ever asked for a year.
  it('explains that the year is derived rather than stored', async () => {
    renderDetail()

    expect(await screen.findByText('Abogacía · año 2026 · derivado de la fecha de inicio')).toBeInTheDocument()
  })

  it('states the dates, the duration and the estado', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: '2do cuatrimestre' })

    expect(screen.getByText('12 ago – 04 dic 2026')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    // Both boundaries are inclusive, so 12 aug -> 4 dec is 115 days.
    expect(screen.getByText(/115 días/)).toBeInTheDocument()
  })

  // The whole reason this screen exists: a period row used to answer "let me
  // change it" instead of "what is in here?".
  it('lists only the materias of this period', async () => {
    renderDetail()

    expect(await screen.findByText('Derecho Penal')).toBeInTheDocument()
    expect(screen.queryByText('Derecho Constitucional')).not.toBeInTheDocument()
  })

  it('says so when the period has no materias yet', async () => {
    materiasApiMock.list.mockResolvedValue([otroPeriodo])
    renderDetail()

    expect(await screen.findByText('Este período todavía no tiene materias.')).toBeInTheDocument()
  })

  it('goes back to the carrera it came from', async () => {
    const onBack = vi.fn()
    renderDetail({ onBack })
    await screen.findByRole('heading', { name: '2do cuatrimestre' })

    await userEvent.click(screen.getByRole('button', { name: 'Abogacía' }))

    expect(onBack).toHaveBeenCalled()
  })

  it('hands the subject over when the screen can navigate to it', async () => {
    const onOpenSubject = vi.fn()
    renderDetail({ onOpenSubject })
    await screen.findByText('Derecho Penal')

    await userEvent.click(screen.getByRole('button', { name: /Derecho Penal/ }))

    expect(onOpenSubject).toHaveBeenCalledWith(1)
  })

  it('does not offer a click-through it cannot honour', async () => {
    renderDetail()
    await screen.findByText('Derecho Penal')

    expect(screen.queryByRole('button', { name: /Derecho Penal/ })).not.toBeInTheDocument()
  })

  // A period deleted from another screen while this one was open.
  it('says the period is gone rather than rendering a detail for nothing', async () => {
    carrerasApiMock.detail.mockResolvedValue({ ...abogacia, periods: [abogacia.periods[0]] })
    renderDetail()

    expect(await screen.findByText('Este período ya no existe.')).toBeInTheDocument()
  })

  it('reports a failed fetch', async () => {
    carrerasApiMock.detail.mockRejectedValue(new Error('boom'))
    renderDetail()

    expect(await screen.findByText('No se pudo cargar el período.')).toBeInTheDocument()
  })
})

// Editing is why the row body stopped opening the form: it moved to an
// explicit button, on the screen the period now has.
describe('PeriodDetailContainer — editar el período', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([propia])
    carrerasApiMock.updatePeriod.mockResolvedValue({ ...abogacia.periods[1], startsOn: '2026-08-17' })
  })

  async function openEditModal() {
    renderDetail()
    await screen.findByRole('heading', { name: '2do cuatrimestre' })
    await userEvent.click(screen.getByRole('button', { name: 'Editar período' }))
    return screen.findByRole('dialog', { name: 'Editar período' })
  }

  it('opens the period already filled in', async () => {
    await openEditModal()

    expect(screen.getByLabelText('Tipo')).toHaveValue('cuatrimestre')
    expect(screen.getByLabelText('Nombre')).toHaveValue('2do cuatrimestre')
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-08-12')
  })

  it('saves the corrected dates without the programId — a period does not change carrera', async () => {
    await openEditModal()

    await userEvent.clear(screen.getByLabelText('Desde'))
    await userEvent.type(screen.getByLabelText('Desde'), '2026-08-17')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(carrerasApiMock.updatePeriod.mock.calls[0]?.[0]).toEqual({
        id: 2,
        name: '2do cuatrimestre',
        kind: 'cuatrimestre',
        startsOn: '2026-08-17',
        endsOn: '2026-12-04'
      })
    })
  })

  it('closes the form once the period is saved', async () => {
    await openEditModal()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Editar período' })).not.toBeInTheDocument()
    })
  })

  it('says why the period could not be saved instead of failing silently', async () => {
    carrerasApiMock.updatePeriod.mockRejectedValue(new Error('boom'))
    await openEditModal()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Ocurrió un error inesperado. Probá de nuevo en un momento.')).toBeInTheDocument()
  })
})

// Adding a subject from here is the shortcut for the case where both the
// carrera and the período are already decided.
describe('PeriodDetailContainer — nueva materia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([propia])
    materiasApiMock.create.mockResolvedValue({ id: 9, name: 'Derecho Civil' })
  })

  it('pre-selects THIS period rather than re-asking', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: '2do cuatrimestre' })

    await userEvent.click(screen.getByRole('button', { name: 'Agregar materia' }))

    const select = (await screen.findByLabelText('Período')) as HTMLSelectElement
    expect(select.value).toBe('2')
  })

  it('creates the subject in this period', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: '2do cuatrimestre' })
    await userEvent.click(screen.getByRole('button', { name: 'Agregar materia' }))

    await userEvent.type(await screen.findByLabelText('Nombre'), 'Derecho Civil')
    await userEvent.type(screen.getByLabelText('Código'), 'DC-210')
    await userEvent.click(screen.getByRole('button', { name: 'Color #4C8DFF' }))
    await userEvent.click(screen.getByRole('button', { name: 'Agregar horario' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear materia' }))

    await waitFor(() => {
      expect(materiasApiMock.create.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ name: 'Derecho Civil', periodId: 2 })
      )
    })
  })
})
