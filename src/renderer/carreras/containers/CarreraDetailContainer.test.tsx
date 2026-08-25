// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import type { SubjectWithStatus } from '../../../shared/ipc/materias'
import { CarreraDetailContainer } from './CarreraDetailContainer'

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

const { fechasApiMock } = vi.hoisted(() => ({
  fechasApiMock: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
}))

vi.mock('../adapters/carrerasApi', () => ({ carrerasApi: carrerasApiMock }))
vi.mock('../../materias/adapters/materiasApi', () => ({ materiasApi: materiasApiMock }))
vi.mock('../../fechas/adapters/fechasApi', () => ({ fechasApi: fechasApiMock }))

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
    { id: 2, programId: 1, name: 'Anual', kind: 'anual', startsOn: '2026-03-09', endsOn: '2026-11-20' }
  ],
  subjectCount: 3,
  gradedSubjects: []
}

function renderDetail(onBack = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CarreraDetailContainer programId={1} onBack={onBack} now={today} />
    </QueryClientProvider>
  )
}

async function openModal() {
  await screen.findByRole('heading', { name: 'Abogacía' })
  await userEvent.click(screen.getByRole('button', { name: 'Agregar período' }))
}

describe('CarreraDetailContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([])
    fechasApiMock.list.mockResolvedValue([])
    carrerasApiMock.createPeriod.mockResolvedValue({
      id: 3,
      programId: 1,
      name: '2do cuatrimestre',
      kind: 'cuatrimestre',
      startsOn: '2026-08-12',
      endsOn: '2026-12-04'
    })
  })

  it('shows the program with its periods', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Abogacía' })).toBeInTheDocument()
    expect(screen.getByText(/Universidad de Buenos Aires · 2 períodos · 3 materias/)).toBeInTheDocument()
    expect(screen.getByText('PERÍODOS · 2')).toBeInTheDocument()
  })

  // The compact rows print the derived year next to the name (the "derivado
  // de la fecha de inicio" explainer lives in the period form and the period
  // detail, not on every row).
  it('prints each period with its derived year next to the name', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    expect(screen.getByText('1er cuatrimestre 2026')).toBeInTheDocument()
    // Twice: the row and the "PERÍODO EN CURSO" card — the Anual is the one
    // period still running on 2026-08-15.
    expect(screen.getAllByText('Anual 2026')).toHaveLength(2)
  })

  it('reports a failed fetch', async () => {
    carrerasApiMock.detail.mockRejectedValue(new Error('boom'))

    renderDetail()

    expect(await screen.findByText('No se pudo cargar la carrera.')).toBeInTheDocument()
  })

  it('goes back to the list', async () => {
    const onBack = vi.fn()
    renderDetail(onBack)
    await screen.findByRole('heading', { name: 'Abogacía' })

    await userEvent.click(screen.getByRole('button', { name: 'Carreras' }))

    expect(onBack).toHaveBeenCalled()
  })

  it('creates a period with explicit dates', async () => {
    renderDetail()
    await openModal()

    await userEvent.selectOptions(screen.getByLabelText('NOMBRE'), '2do cuatrimestre')
    await userEvent.type(screen.getByLabelText('DESDE'), '2026-08-12')
    await userEvent.type(screen.getByLabelText('HASTA'), '2026-12-04')
    await userEvent.click(screen.getByRole('button', { name: 'Crear período' }))

    await waitFor(() => {
      expect(carrerasApiMock.createPeriod.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ programId: 1, startsOn: '2026-08-12', endsOn: '2026-12-04' })
      )
    })
  })

  // The nombre picker only holds the names its tipo derives, so the two
  // fields cannot disagree — the whole reason they stopped being free text.
  it('offers only the names the chosen tipo derives', async () => {
    renderDetail()
    await openModal()

    expect(screen.getByRole('option', { name: '1er cuatrimestre' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '2do cuatrimestre' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '3er cuatrimestre' })).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('TIPO'), 'bimestre')

    expect(await screen.findByRole('option', { name: '4to bimestre' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '2do cuatrimestre' })).not.toBeInTheDocument()
  })

  // Changing the tipo must not leave a name the new tipo cannot produce.
  it('drops a name the new tipo does not offer', async () => {
    renderDetail()
    await openModal()

    await userEvent.selectOptions(screen.getByLabelText('NOMBRE'), '2do cuatrimestre')
    await userEvent.selectOptions(screen.getByLabelText('TIPO'), 'anual')

    expect(screen.getByLabelText('NOMBRE')).toHaveValue('')
  })

  it('creates an open-ended period when the end date is waived', async () => {
    renderDetail()
    await openModal()

    await userEvent.selectOptions(screen.getByLabelText('TIPO'), 'curso')
    await userEvent.selectOptions(screen.getByLabelText('NOMBRE'), 'Curso')
    await userEvent.type(screen.getByLabelText('DESDE'), '2026-09-01')
    await userEvent.click(screen.getByRole('checkbox', { name: /Sin fecha de fin/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear período' }))

    await waitFor(() => {
      expect(carrerasApiMock.createPeriod.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ kind: 'curso', endsOn: null })
      )
    })
  })

  // A curso does not tile the year, but it is NOT forced to be open-ended:
  // a course with a start and an end is the ordinary case.
  it('lets a curso carry both dates', async () => {
    renderDetail()
    await openModal()

    await userEvent.selectOptions(screen.getByLabelText('TIPO'), 'curso')
    await userEvent.selectOptions(screen.getByLabelText('NOMBRE'), 'Curso')
    await userEvent.type(screen.getByLabelText('DESDE'), '2026-09-01')
    await userEvent.type(screen.getByLabelText('HASTA'), '2026-11-30')
    await userEvent.click(screen.getByRole('button', { name: 'Crear período' }))

    await waitFor(() => {
      expect(carrerasApiMock.createPeriod.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ kind: 'curso', startsOn: '2026-09-01', endsOn: '2026-11-30' })
      )
    })
  })

  it('derives the year from the start date instead of asking for it', async () => {
    renderDetail()
    await openModal()

    expect(screen.queryByLabelText('Año')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('DESDE'), '2026-08-12')

    expect(await screen.findByText('Año 2026')).toBeInTheDocument()
  })

  it('keeps the starting year for a period that crosses into the next one', async () => {
    renderDetail()
    await openModal()

    await userEvent.type(screen.getByLabelText('DESDE'), '2026-11-03')
    await userEvent.type(screen.getByLabelText('HASTA'), '2027-03-15')

    expect(await screen.findByText('Año 2026')).toBeInTheDocument()
  })

  // An overlap is INFORMATION, not a validation failure — the submit must
  // still go through.
  it('announces an overlap without blocking the period', async () => {
    renderDetail()
    await openModal()

    await userEvent.selectOptions(screen.getByLabelText('TIPO'), 'anual')
    await userEvent.selectOptions(screen.getByLabelText('NOMBRE'), 'Anual')
    await userEvent.type(screen.getByLabelText('DESDE'), '2026-04-01')
    await userEvent.type(screen.getByLabelText('HASTA'), '2026-06-01')

    expect(await screen.findByText(/Se solapa con/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Crear período' }))

    await waitFor(() => {
      expect(carrerasApiMock.createPeriod).toHaveBeenCalled()
    })
  })

  it('does not submit a period with no name', async () => {
    renderDetail()
    await openModal()

    await userEvent.type(screen.getByLabelText('DESDE'), '2026-08-12')
    await userEvent.click(screen.getByRole('button', { name: 'Crear período' }))

    await waitFor(() => {
      expect(screen.getByText('Poné un nombre')).toBeInTheDocument()
    })
    expect(carrerasApiMock.createPeriod).not.toHaveBeenCalled()
  })

  it('rejects an end date before the start date', async () => {
    renderDetail()
    await openModal()

    await userEvent.selectOptions(screen.getByLabelText('NOMBRE'), '1er cuatrimestre')
    await userEvent.type(screen.getByLabelText('DESDE'), '2026-08-12')
    await userEvent.type(screen.getByLabelText('HASTA'), '2026-08-11')
    await userEvent.click(screen.getByRole('button', { name: 'Crear período' }))

    await waitFor(() => {
      expect(screen.getByText('La fecha de fin tiene que ser posterior a la de inicio')).toBeInTheDocument()
    })
    expect(carrerasApiMock.createPeriod).not.toHaveBeenCalled()
  })
})

// A period is the one thing on this screen that DATES everything else, so a
// mistyped date has to be correctable — and a period created by mistake has
// to be removable without taking its materias down with it.
describe('CarreraDetailContainer — editar y eliminar períodos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([])
    fechasApiMock.list.mockResolvedValue([])
    carrerasApiMock.updatePeriod.mockResolvedValue({ ...abogacia.periods[0], startsOn: '2026-03-16' })
    carrerasApiMock.deletePeriod.mockResolvedValue({ id: 1, unlinkedSubjects: 0 })
  })

  // Editing is the PENCIL now. The row body opens the period's own screen,
  // because one gesture cannot mean both "show me what is in here" and "let
  // me change it".
  async function openEditModal() {
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })
    await userEvent.click(screen.getByRole('button', { name: 'Editar 1er cuatrimestre' }))
    return screen.findByRole('dialog', { name: 'Editar período' })
  }

  it('opens the period for editing from the row action, not from the row body', async () => {
    const onSelectPeriod = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <CarreraDetailContainer programId={1} onBack={vi.fn()} onSelectPeriod={onSelectPeriod} now={today} />
      </QueryClientProvider>
    )
    await screen.findByRole('heading', { name: 'Abogacía' })

    await userEvent.click(screen.getByRole('button', { name: /^1er cuatrimestre/ }))

    expect(onSelectPeriod).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('dialog', { name: 'Editar período' })).not.toBeInTheDocument()
  })

  // Without somewhere to send the user the row must not pretend to be
  // clickable — the same rule the subject rows follow.
  it('does not offer a click-through it cannot honour', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    expect(screen.queryByRole('button', { name: /^1er cuatrimestre/ })).not.toBeInTheDocument()
  })

  it('opens the period already filled in', async () => {
    await openEditModal()

    expect(screen.getByLabelText('NOMBRE')).toHaveValue('1er cuatrimestre')
    expect(screen.getByLabelText('TIPO')).toHaveValue('cuatrimestre')
    expect(screen.getByLabelText('DESDE')).toHaveValue('2026-03-09')
    expect(screen.getByLabelText('HASTA')).toHaveValue('2026-07-18')
  })

  it('saves the corrected dates without the programId — a period does not change carrera', async () => {
    await openEditModal()

    await userEvent.clear(screen.getByLabelText('DESDE'))
    await userEvent.type(screen.getByLabelText('DESDE'), '2026-03-16')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(carrerasApiMock.updatePeriod.mock.calls[0]?.[0]).toEqual({
        id: 1,
        name: '1er cuatrimestre',
        kind: 'cuatrimestre',
        startsOn: '2026-03-16',
        endsOn: '2026-07-18'
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

  // A period always overlaps itself; saying so while editing it is noise.
  it('does not announce the edited period as overlapping itself', async () => {
    await openEditModal()

    expect(screen.getByText(/Se solapa con/)).toHaveTextContent('Anual')
    expect(screen.queryByText(/Se solapa con.*1er cuatrimestre/)).not.toBeInTheDocument()
  })

  // A period saved before the catalogue existed. It is still SHOWN as it was
  // saved — the read side stays permissive on purpose — but it cannot be
  // saved again as it is.
  const legacy = {
    ...abogacia,
    periods: [{ id: 5, programId: 1, name: 'Clases de inglés', kind: 'clases', startsOn: '2026-03-09', endsOn: null }]
  }

  async function openLegacyEditModal() {
    carrerasApiMock.detail.mockResolvedValue(legacy)
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })
    await userEvent.click(screen.getByRole('button', { name: 'Editar Clases de inglés' }))
    return screen.findByRole('dialog', { name: 'Editar período' })
  }

  it('opens an open-ended period with the end date already waived', async () => {
    await openLegacyEditModal()

    expect(await screen.findByRole('checkbox', { name: /Sin fecha de fin/ })).toBeChecked()
  })

  // Mapping "clases" to the nearest catalogued kind would rename the period
  // on the user's behalf, from a form they may have opened only to fix a
  // date. Empty asks; a guess decides.
  it('opens a pre-catalogue period empty rather than guessing its tipo', async () => {
    await openLegacyEditModal()

    expect(screen.getByLabelText('TIPO')).toHaveValue('')
    expect(screen.getByLabelText('NOMBRE')).toHaveValue('')
    expect(screen.getByText(/se guardó como/i)).toHaveTextContent('Clases de inglés')
  })

  it('refuses to save a pre-catalogue period until a tipo is chosen', async () => {
    await openLegacyEditModal()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(screen.getByText('Poné un nombre')).toBeInTheDocument()
    })
    expect(carrerasApiMock.updatePeriod).not.toHaveBeenCalled()
  })

  // The real-world case that motivated the open-ended period: one saved with
  // no end date must survive a round-trip through the edit form without
  // acquiring one.
  it('saves an open-ended period without inventing an end date', async () => {
    carrerasApiMock.updatePeriod.mockResolvedValue({
      id: 5,
      programId: 1,
      name: 'Curso',
      kind: 'curso',
      startsOn: '2026-03-09',
      endsOn: null
    })
    await openLegacyEditModal()

    await userEvent.selectOptions(screen.getByLabelText('TIPO'), 'curso')
    await userEvent.selectOptions(screen.getByLabelText('NOMBRE'), 'Curso')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(carrerasApiMock.updatePeriod.mock.calls[0]?.[0]).toEqual({
        id: 5,
        name: 'Curso',
        kind: 'curso',
        startsOn: '2026-03-09',
        endsOn: null
      })
    })
  })

  // A write that fails and says nothing reads as a dead button — which is
  // exactly how a stale preload bridge presents itself.
  it('says why the period could not be saved instead of failing silently', async () => {
    carrerasApiMock.updatePeriod.mockRejectedValue(new Error('window.api.carreras.updatePeriod is not a function'))
    await openEditModal()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Ocurrió un error inesperado. Probá de nuevo en un momento.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Editar período' })).toBeInTheDocument()
  })

  it('says why the period could not be deleted instead of failing silently', async () => {
    carrerasApiMock.deletePeriod.mockRejectedValue(new Error('boom'))
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Anual' }))
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar período' }))

    expect(await screen.findByText('Ocurrió un error inesperado. Probá de nuevo en un momento.')).toBeInTheDocument()
  })

  it('asks before deleting, and only deletes on confirmation', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar 1er cuatrimestre' }))

    expect(await screen.findByRole('dialog', { name: 'Eliminar 1er cuatrimestre' })).toBeInTheDocument()
    expect(carrerasApiMock.deletePeriod).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar período' }))

    await waitFor(() => {
      expect(carrerasApiMock.deletePeriod.mock.calls[0]?.[0]).toBe(1)
    })
  })

  it('leaves the period alone when the confirmation is cancelled', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Anual' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Eliminar Anual' })).not.toBeInTheDocument()
    })
    expect(carrerasApiMock.deletePeriod).not.toHaveBeenCalled()
  })

  // The count is the whole safety story: the materias SURVIVE, they just
  // stop belonging to this carrera until reassigned.
  it('warns how many materias would be left without a period', async () => {
    materiasApiMock.list.mockResolvedValue([
      {
        id: 1,
        name: 'Derecho Constitucional',
        code: 'DC-100',
        color: '#4c8dff',
        docente: null,
        contacto: null,
        comision: null,
        aula: null,
        campusUrl: null,
        groupUrl: null,
        notas: null,
        attendanceMinPercent: null,
        periodId: 1,
        outcome: null,
        grade: null,
        slots: [],
        period: { id: 1, name: '1er cuatrimestre', startsOn: '2026-03-09', endsOn: '2026-07-18' },
        program: { id: 1, name: 'Abogacía', gradingScheme: 'numerico', gradeScale: 10 },
        finals: [],
        pendingDeadlines: 0
      } satisfies SubjectWithStatus
    ])
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar 1er cuatrimestre' }))

    expect(await screen.findByText(/1 materia queda sin período/)).toBeInTheDocument()
  })
})

// The right rail mirrors SubjectDetail's: a "PERÍODO EN CURSO" card and a
// numbers card, both derived from data this screen already fetches — no
// extra IPC.
describe('CarreraDetailContainer — right rail cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([])
    fechasApiMock.list.mockResolvedValue([])
  })

  it('shows the active period with its range in the PERÍODO EN CURSO card', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    // Scoped to the card: the timeline prints the same range for its bars.
    const card = screen.getByText('PERÍODO EN CURSO').parentElement!
    // On 2026-08-15 only the Anual is running: the card prints its range
    // with no "junto con" companion.
    expect(within(card).getByText('09 mar – 20 nov 2026')).toBeInTheDocument()
    expect(screen.queryByText(/junto con/)).not.toBeInTheDocument()
  })

  // Two periods can run at once (an anual alongside a cuatrimestre): the
  // card shows the one ending SOONEST and names the other as a companion.
  it('shows the sooner-ending period and names the other when two run at once', async () => {
    carrerasApiMock.detail.mockResolvedValue({
      ...abogacia,
      periods: [
        { id: 2, programId: 1, name: 'Anual', kind: 'anual', startsOn: '2026-03-09', endsOn: '2026-11-20' },
        {
          id: 1,
          programId: 1,
          name: '2do cuatrimestre',
          kind: 'cuatrimestre',
          startsOn: '2026-08-03',
          endsOn: '2026-11-01'
        }
      ]
    })
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    // Twice = row + card: the cuatrimestre ends before the Anual, so it is
    // the one the card names even though it is listed second.
    expect(screen.getAllByText('2do cuatrimestre 2026')).toHaveLength(2)
    expect(screen.getByText(/junto con Anual/)).toBeInTheDocument()
  })

  it('says so when no period is active', async () => {
    carrerasApiMock.detail.mockResolvedValue({
      ...abogacia,
      periods: [
        {
          id: 1,
          programId: 1,
          name: '1er cuatrimestre',
          kind: 'cuatrimestre',
          startsOn: '2026-03-09',
          endsOn: '2026-07-18'
        }
      ]
    })
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    expect(screen.getByText('Sin período en curso')).toBeInTheDocument()
  })

  it('counts períodos and períodos en curso in the avance card', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    const periodsRow = screen.getByText('Períodos').parentElement!
    expect(within(periodsRow).getByText('2')).toBeInTheDocument()
    const activeRow = screen.getByText('En curso').parentElement!
    expect(within(activeRow).getByText('1')).toBeInTheDocument()
  })
})

// The numbers card became the "AVANCE ACADÉMICO" card (design node `ghb9r`):
// the promedio con aplazos as the hero number and the approved count as a
// pill over a progress bar — all still derived from the detail payload the
// screen already fetches. The plain Materias count is gone: it already reads
// in the header subtitle and in the pill's own total.
describe('CarreraDetailContainer — avance académico', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([])
    fechasApiMock.list.mockResolvedValue([])
  })

  async function findCard() {
    await screen.findByRole('heading', { name: 'Abogacía' })
    return screen.getByText('AVANCE ACADÉMICO').parentElement!
  }

  it('prints the promedio general with comma decimals, always two places', async () => {
    carrerasApiMock.detail.mockResolvedValue({
      ...abogacia,
      gradedSubjects: [
        { grade: 8, outcome: 'aprobada' as const, hasApprovedFinal: false, approvedFinalGrade: null },
        { grade: 9, outcome: 'aprobada' as const, hasApprovedFinal: false, approvedFinalGrade: null }
      ]
    })
    renderDetail()

    const card = await findCard()
    expect(within(card).getByText('8,50')).toBeInTheDocument()
    expect(within(card).getByText('promedio general')).toBeInTheDocument()
  })

  // A subject passed via final carries its nota on the approved mesa, not on
  // the subject row — the promedio has to read it through the same effective
  // grade the domain resolves (resolveEffectiveGrade).
  it('feeds the approved final nota into the promedio when the subject has none of its own', async () => {
    carrerasApiMock.detail.mockResolvedValue({
      ...abogacia,
      gradedSubjects: [
        { grade: 8, outcome: 'aprobada' as const, hasApprovedFinal: false, approvedFinalGrade: null },
        { grade: null, outcome: 'finalPendiente' as const, hasApprovedFinal: true, approvedFinalGrade: 9 }
      ]
    })
    renderDetail()

    const card = await findCard()
    expect(within(card).getByText('8,50')).toBeInTheDocument()
  })

  // Nothing graded — the empty numerico case and the whole binario scheme —
  // has no number to show, and a fabricated 0,00 would read as an aplazo.
  it('prints a dash rather than a number while nothing is graded', async () => {
    renderDetail()

    const card = await findCard()
    expect(within(card).getByText('—')).toBeInTheDocument()
    expect(within(card).getByText('promedio general')).toBeInTheDocument()
  })

  // The pill counts by the SAME rule the estado badges use (isPassed): an
  // approved final closes a finalPendiente subject, but an explicit
  // `reprobada` wins even when an approved final exists.
  it('counts the approved subjects against the carrera total in the pill', async () => {
    carrerasApiMock.detail.mockResolvedValue({
      ...abogacia,
      subjectCount: 6,
      gradedSubjects: [
        { grade: 8, outcome: 'aprobada' as const, hasApprovedFinal: false, approvedFinalGrade: null },
        { grade: null, outcome: 'finalPendiente' as const, hasApprovedFinal: true, approvedFinalGrade: null },
        { grade: 2, outcome: 'reprobada' as const, hasApprovedFinal: true, approvedFinalGrade: null },
        { grade: null, outcome: null, hasApprovedFinal: false, approvedFinalGrade: null }
      ]
    })
    renderDetail()

    const card = await findCard()
    expect(within(card).getByText('2 de 6 aprobadas')).toBeInTheDocument()
  })

  it('reads singular when exactly one subject is approved', async () => {
    carrerasApiMock.detail.mockResolvedValue({
      ...abogacia,
      gradedSubjects: [{ grade: 9, outcome: 'aprobada' as const, hasApprovedFinal: false, approvedFinalGrade: null }]
    })
    renderDetail()

    const card = await findCard()
    expect(within(card).getByText('1 de 3 aprobada')).toBeInTheDocument()
  })

  it('fills the progress bar with the approved share of the subjects', async () => {
    carrerasApiMock.detail.mockResolvedValue({
      ...abogacia,
      subjectCount: 6,
      gradedSubjects: [
        { grade: 8, outcome: 'aprobada' as const, hasApprovedFinal: false, approvedFinalGrade: null },
        { grade: 7, outcome: 'aprobada' as const, hasApprovedFinal: false, approvedFinalGrade: null },
        { grade: 9, outcome: 'aprobada' as const, hasApprovedFinal: false, approvedFinalGrade: null }
      ]
    })
    renderDetail()

    const card = await findCard()
    expect(card.querySelector('.bg-ok')).toHaveStyle({ width: '50%' })
  })

  it('keeps the fill empty when the carrera has no subjects at all', async () => {
    carrerasApiMock.detail.mockResolvedValue({ ...abogacia, subjectCount: 0, gradedSubjects: [] })
    renderDetail()

    const card = await findCard()
    expect(card.querySelector('.bg-ok')).toHaveStyle({ width: '0%' })
  })

  it('no longer prints the plain Materias row', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    expect(screen.queryByText('Materias')).not.toBeInTheDocument()
  })
})

// There is no `carreras:update` channel — a carrera cannot be corrected after
// the fact — so deleting it is the ONLY way out of one created wrong. The
// whole stack for it already existed (main handler, repository, adapter); the
// screen simply never offered it, which made the mistake permanent.
describe('CarreraDetailContainer — eliminar carrera', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([])
    fechasApiMock.list.mockResolvedValue([])
    carrerasApiMock.delete.mockResolvedValue({ id: 1, deletedPeriods: 2, unlinkedSubjects: 3 })
  })

  // Editing and deleting a carrera live TOGETHER, in the edit modal — the
  // same shape as the Materias screen, and the reason the detail header does
  // not carry a standalone delete button.
  async function openDeleteDialog() {
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })
    await userEvent.click(screen.getByRole('button', { name: 'Editar carrera' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar carrera' }))
    return screen.findByRole('dialog', { name: 'Eliminar Abogacía' })
  }

  // Opening the confirmation closes the form behind it, so the destructive
  // question is never asked underneath an editable copy of the same carrera.
  it('replaces the edit form with the confirmation', async () => {
    await openDeleteDialog()

    expect(screen.queryByRole('dialog', { name: 'Editar carrera' })).not.toBeInTheDocument()
  })

  it('asks before deleting, and only deletes on confirmation', async () => {
    const dialog = await openDeleteDialog()
    expect(carrerasApiMock.delete).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar carrera' }))

    await waitFor(() => {
      expect(carrerasApiMock.delete.mock.calls[0]?.[0]).toBe(1)
    })
  })

  // The screen it was showing no longer exists, so staying on it would render
  // a detail for a deleted program.
  it('returns to the list once the carrera is gone', async () => {
    const onBack = vi.fn()
    renderDetail(onBack)
    await screen.findByRole('heading', { name: 'Abogacía' })

    await userEvent.click(screen.getByRole('button', { name: 'Editar carrera' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar carrera' }))
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar Abogacía' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar carrera' }))

    await waitFor(() => {
      expect(onBack).toHaveBeenCalled()
    })
  })

  // The two counts answer DIFFERENT questions, and the delete treats them
  // differently: the periods are destroyed with the carrera, the materias
  // survive it. Reporting only one of them is what makes the dialog a lie.
  it('warns that the periods go and the materias stay', async () => {
    const dialog = await openDeleteDialog()

    expect(within(dialog).getByText(/Se eliminan también sus 2 períodos/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Sus 3 materias no se eliminan/)).toBeInTheDocument()
  })

  // Same rule as the period dialog: a zero count says nothing rather than
  // "0 materias", which reads like something was left out.
  it('says nothing about materias when the carrera has none', async () => {
    carrerasApiMock.detail.mockResolvedValue({ ...abogacia, subjectCount: 0 })
    const dialog = await openDeleteDialog()

    expect(within(dialog).queryByText(/materias no se eliminan/)).not.toBeInTheDocument()
    expect(within(dialog).getByText(/Se eliminan también sus 2 períodos/)).toBeInTheDocument()
  })

  it('leaves the carrera alone when the confirmation is cancelled', async () => {
    const dialog = await openDeleteDialog()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Eliminar Abogacía' })).not.toBeInTheDocument()
    })
    expect(carrerasApiMock.delete).not.toHaveBeenCalled()
  })

  it('says why the carrera could not be deleted instead of failing silently', async () => {
    carrerasApiMock.delete.mockRejectedValue(new Error('boom'))
    const dialog = await openDeleteDialog()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar carrera' }))

    expect(await screen.findByText('Ocurrió un error inesperado. Probá de nuevo en un momento.')).toBeInTheDocument()
  })
})

// A carrera used to be uncorrectable: the name, the institution and the colour
// were frozen at creation along with everything else. Only the GRADING SCHEME
// has a real reason to freeze, and only once something has been graded.
describe('CarreraDetailContainer — editar carrera', () => {
  const sinNotas = {
    ...abogacia,
    subjectCount: 0,
    gradedSubjects: []
  }

  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([])
    fechasApiMock.list.mockResolvedValue([])
    carrerasApiMock.update.mockResolvedValue({ ...abogacia, name: 'Abogacía (UBA)' })
  })

  async function openEditModal() {
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })
    await userEvent.click(screen.getByRole('button', { name: 'Editar carrera' }))
    return screen.findByRole('dialog', { name: 'Editar carrera' })
  }

  it('opens the carrera already filled in', async () => {
    await openEditModal()

    expect(screen.getByLabelText('NOMBRE')).toHaveValue('Abogacía')
    expect(screen.getByLabelText('INSTITUCIÓN')).toHaveValue('Universidad de Buenos Aires')
  })

  it('saves the corrected fields with the id', async () => {
    await openEditModal()

    await userEvent.clear(screen.getByLabelText('NOMBRE'))
    await userEvent.type(screen.getByLabelText('NOMBRE'), 'Abogacía (UBA)')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(carrerasApiMock.update.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ id: 1, name: 'Abogacía (UBA)', institution: 'Universidad de Buenos Aires' })
      )
    })
  })

  it('closes the form once the carrera is saved', async () => {
    await openEditModal()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Editar carrera' })).not.toBeInTheDocument()
    })
  })

  it('does not submit a carrera with no name', async () => {
    await openEditModal()

    await userEvent.clear(screen.getByLabelText('NOMBRE'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(screen.getByText('Poné un nombre')).toBeInTheDocument()
    })
    expect(carrerasApiMock.update).not.toHaveBeenCalled()
  })

  it('says why the carrera could not be saved instead of failing silently', async () => {
    carrerasApiMock.update.mockRejectedValue(new Error('window.api.carreras.update is not a function'))
    await openEditModal()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Ocurrió un error inesperado. Probá de nuevo en un momento.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Editar carrera' })).toBeInTheDocument()
  })

  // `abogacia` carries a graded subject, so its scale is spoken for: changing
  // it would REINTERPRET that grade rather than rescale it.
  it('locks the grading scheme once something has been graded, and says why', async () => {
    carrerasApiMock.detail.mockResolvedValue({
      ...abogacia,
      gradedSubjects: [{ grade: 8, outcome: 'aprobada', hasApprovedFinal: false, approvedFinalGrade: null }]
    })
    await openEditModal()

    expect(screen.getByText(/no se puede cambiar/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprobado / Desaprobado' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('ESCALA')).not.toBeInTheDocument()
  })

  // Nothing recorded means nothing to reinterpret — a carrera created with the
  // wrong scale five minutes ago must be fixable.
  it('lets the scheme be corrected while nothing has been graded', async () => {
    carrerasApiMock.detail.mockResolvedValue(sinNotas)
    await openEditModal()

    expect(screen.queryByText(/no se puede cambiar/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprobado / Desaprobado' })).toBeInTheDocument()
  })

  it('drops the scale when an ungraded carrera moves to pass/fail', async () => {
    carrerasApiMock.detail.mockResolvedValue(sinNotas)
    await openEditModal()

    await userEvent.click(screen.getByRole('button', { name: 'Aprobado / Desaprobado' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(carrerasApiMock.update.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ gradingScheme: 'binario', gradeScale: null })
      )
    })
  })

  // A subject with no grade but a recorded outcome is the `binario` case —
  // it has been evaluated, it just has no number.
  it('locks the scheme for a pass/fail carrera with a recorded outcome', async () => {
    carrerasApiMock.detail.mockResolvedValue({
      ...abogacia,
      gradingScheme: 'binario' as const,
      gradeScale: null,
      gradedSubjects: [{ grade: null, outcome: 'aprobada' as const, hasApprovedFinal: false, approvedFinalGrade: null }]
    })
    await openEditModal()

    expect(screen.getByText(/no se puede cambiar/i)).toBeInTheDocument()
  })
})

// Adding a subject from here is the shortcut for the case where you already
// know which carrera it belongs to — the same form as the Materias screen,
// but with the carrera already decided.
describe('CarreraDetailContainer — nueva materia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([])
    fechasApiMock.list.mockResolvedValue([])
    materiasApiMock.create.mockResolvedValue({ id: 9, name: 'Derecho Penal' })
  })

  async function openSubjectModal() {
    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })
    await userEvent.click(screen.getByRole('button', { name: 'Agregar materia' }))
  }

  // The whole point of creating from here: the carrera is already known, so
  // the picker must not go fetch (or offer) every other program's periods.
  it('offers only the periods of this carrera', async () => {
    await openSubjectModal()

    expect(await screen.findByRole('option', { name: '1er cuatrimestre' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Anual' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(carrerasApiMock.list).not.toHaveBeenCalled()
  })

  it('pre-selects the active period of this carrera', async () => {
    await openSubjectModal()

    const select = (await screen.findByLabelText('PERÍODO')) as HTMLSelectElement
    expect(select.value).toBe('2')
  })

  it('creates the subject in the chosen period', async () => {
    await openSubjectModal()

    await userEvent.type(screen.getByLabelText('NOMBRE'), 'Derecho Penal')
    await userEvent.type(screen.getByLabelText('CÓDIGO'), 'DP-210')
    await userEvent.click(screen.getByRole('button', { name: 'Color #4C8DFF' }))
    await userEvent.click(screen.getByRole('button', { name: 'Agregar horario' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear materia' }))

    await waitFor(() => {
      expect(materiasApiMock.create.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ name: 'Derecho Penal', periodId: 2 })
      )
    })
  })

  it('closes the form once the subject is created', async () => {
    await openSubjectModal()

    await userEvent.type(screen.getByLabelText('NOMBRE'), 'Derecho Penal')
    await userEvent.type(screen.getByLabelText('CÓDIGO'), 'DP-210')
    await userEvent.click(screen.getByRole('button', { name: 'Color #4C8DFF' }))
    await userEvent.click(screen.getByRole('button', { name: 'Agregar horario' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear materia' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Nueva materia' })).not.toBeInTheDocument()
    })
  })

  it('blocks the form when this carrera has no period yet, and says why', async () => {
    carrerasApiMock.detail.mockResolvedValue({ ...abogacia, periods: [] })

    await openSubjectModal()

    expect(await screen.findByText('Todavía no tenés ningún período cargado')).toBeInTheDocument()
    expect(screen.queryByLabelText('NOMBRE')).not.toBeInTheDocument()
  })
})

// Creating a subject from a screen that never shows one is a dead end, so
// the carrera detail also lists what it owns.
describe('CarreraDetailContainer — materias de la carrera', () => {
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
      period: { id: 2, name: 'Anual', startsOn: '2026-03-09', endsOn: '2026-11-20' },
      program: { id: 1, name: 'Abogacía', gradingScheme: 'numerico', gradeScale: 10 },
      finals: [],
      pendingDeadlines: 0,
      ...overrides
    }
  }

  const propia = subject({ id: 1, name: 'Derecho Constitucional' })
  const ajena = subject({
    id: 2,
    name: 'Anatomía',
    program: { id: 2, name: 'Medicina', gradingScheme: 'numerico', gradeScale: 10 }
  })
  const huerfana = subject({ id: 3, name: 'Materia suelta', periodId: null, period: null, program: null })

  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([propia, ajena, huerfana])
  })

  // The MATERIAS column (design node `fMy0V`) counts from the SAME cached
  // list this screen already renders below — no second IPC channel.
  it('counts the materias of each period', async () => {
    renderDetail()
    await screen.findByText('Derecho Constitucional')

    // Only `propia` reaches this carrera: `ajena` belongs to another program
    // and `huerfana` to none, so neither may land in this carrera's count.
    expect(screen.getByText('1 materia')).toBeInTheDocument()
    expect(screen.getByText('Sin materias')).toBeInTheDocument()
  })

  it('says nothing rather than zero while the subjects are still loading', async () => {
    materiasApiMock.list.mockReturnValue(new Promise(() => {}))

    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    // Scoped to the periods table: the AVANCE ACADÉMICO card prints its own
    // dash while nothing is graded, and that one is not a loading state.
    const table = screen.getByText('PERÍODOS · 2').parentElement!
    expect(within(table).getAllByText('—')).toHaveLength(2)
    expect(screen.queryByText('Sin materias')).not.toBeInTheDocument()
  })

  it('lists only the subjects of this carrera', async () => {
    renderDetail()

    expect(await screen.findByText('Derecho Constitucional')).toBeInTheDocument()
    expect(screen.queryByText('Anatomía')).not.toBeInTheDocument()
    expect(screen.queryByText('Materia suelta')).not.toBeInTheDocument()
    // The heading counts what the list shows — the count is appended outside
    // the translation, same pattern as the PERÍODOS heading.
    expect(screen.getByText('MATERIAS DE ESTA CARRERA · 1')).toBeInTheDocument()
  })

  it('says so when the carrera has no subjects yet', async () => {
    materiasApiMock.list.mockResolvedValue([ajena])

    renderDetail()
    await screen.findByRole('heading', { name: 'Abogacía' })

    expect(await screen.findByText('Esta carrera todavía no tiene materias.')).toBeInTheDocument()
  })

  // Without somewhere to send the user the rows must not pretend to be
  // clickable — a button that does nothing is worse than plain text.
  it('does not offer a click-through it cannot honour', async () => {
    renderDetail()
    await screen.findByText('Derecho Constitucional')

    expect(screen.queryByRole('button', { name: /Derecho Constitucional/ })).not.toBeInTheDocument()
  })

  it('hands the subject over when the screen can navigate to it', async () => {
    const onOpenSubject = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <CarreraDetailContainer programId={1} onBack={vi.fn()} onOpenSubject={onOpenSubject} now={today} />
      </QueryClientProvider>
    )
    await screen.findByText('Derecho Constitucional')

    await userEvent.click(screen.getByRole('button', { name: /Derecho Constitucional/ }))

    expect(onOpenSubject).toHaveBeenCalledWith(1)
  })
})

// The carrera is where administrative dates live: they belong to the program,
// not to any one materia, so the card sits in this screen's right rail.
describe('CarreraDetailContainer — fechas administrativas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([])
    fechasApiMock.list.mockResolvedValue([
      {
        id: 1,
        programId: 1,
        title: 'Inscripción a finales',
        kind: 'inscripcionFinales',
        startsOn: '2026-12-01',
        endsOn: '2026-12-05',
        programName: 'Abogacía'
      }
    ])
  })

  it('mounts the card after the academic-progress card, showing this carrera dates', async () => {
    renderDetail()

    expect(await screen.findByText('FECHAS ADMINISTRATIVAS')).toBeInTheDocument()
    expect(screen.getByText('Inscripción a finales')).toBeInTheDocument()
    expect(screen.getByText('1 – 5 DIC')).toBeInTheDocument()
  })

  it('opens the creation form from the card', async () => {
    renderDetail()
    await screen.findByText('FECHAS ADMINISTRATIVAS')

    await userEvent.click(screen.getByRole('button', { name: 'Agregar fecha' }))

    expect(screen.getByRole('dialog', { name: 'Nueva fecha administrativa' })).toBeInTheDocument()
  })
})
