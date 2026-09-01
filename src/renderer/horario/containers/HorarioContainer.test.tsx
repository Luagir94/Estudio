// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectDetailResult, SubjectWithSlots, SubjectWithStatus } from '../../../shared/ipc/materias'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { horarioApi } from '../adapters/horarioApi'
import { HorarioContainer } from './HorarioContainer'

vi.mock('../adapters/horarioApi', () => ({
  horarioApi: { week: vi.fn() }
}))

vi.mock('../../materias/adapters/materiasApi', () => ({
  materiasApi: { detail: vi.fn(), updateSchedule: vi.fn(), list: vi.fn() }
}))

vi.mock('../../clases/containers/ClaseModalContainer', () => ({
  ClaseModalContainer: ({ subjectId, date, onClose }: { subjectId: number; date: string; onClose: () => void }) => (
    <div role="dialog" aria-label="Clase" data-subject-id={subjectId} data-date={date}>
      <button type="button" onClick={onClose}>
        stub-clase-close
      </button>
    </div>
  )
}))

const sampleSubjects: SubjectWithSlots[] = [
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
    programId: null,
    nivel: null,
    outcome: null,
    grade: null,
    regularity: null,
    slots: [{ id: 1, subjectId: 1, dayOfWeek: 1, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }]
  }
]

const sampleDetail: SubjectDetailResult = {
  ...sampleSubjects[0]!,
  deadlines: [],
  period: null,
  program: null,
  finals: [],
  parciales: [],
  attendance: [],
  classNotes: [],
  prerequisites: []
}

// The ['materias'] facts the container filters against (outcome, period
// dates, finals) — the horario:week payload itself carries no period/finals.
function makeFacts(subject: SubjectWithSlots, overrides: Partial<SubjectWithStatus> = {}): SubjectWithStatus {
  return { ...subject, period: null, program: null, finals: [], pendingDeadlines: 0, prerequisites: [], ...overrides }
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('HorarioContainer', () => {
  beforeEach(() => {
    vi.mocked(horarioApi.week).mockResolvedValue(sampleSubjects)
    vi.mocked(materiasApi.list).mockResolvedValue(sampleSubjects.map((subject) => makeFacts(subject)))
    vi.mocked(materiasApi.detail).mockResolvedValue(sampleDetail)
    vi.mocked(materiasApi.updateSchedule).mockResolvedValue(sampleSubjects[0]!)
  })

  it('fetches on the ["horario","week"] query key and renders the grid with the projected class', async () => {
    renderWithClient(<HorarioContainer now={new Date('2026-03-04T09:00:00')} />)

    expect(await screen.findByText('Sistemas Operativos')).toBeInTheDocument()
    expect(horarioApi.week).toHaveBeenCalledTimes(1)
  })

  /*
   * Editing the horario is NOT one of this screen's affordances any more. It
   * is already a click away from the materia, so a shortcut here was a
   * duplicate — and it was occupying the only room left for the apunte, which
   * had no other path to a class that is not today.
   */
  it('offers no schedule-edit shortcut, because the materia already carries one', async () => {
    renderWithClient(<HorarioContainer now={new Date('2026-03-04T09:00:00')} />)

    await screen.findByTestId('horario-class-block')

    expect(screen.queryByRole('button', { name: /Editar horario/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Editar materia' })).not.toBeInTheDocument()
  })

  // Closed or final-stage subjects no longer attend classes, so their slots
  // must not occupy the weekly grid (the week payload still carries them —
  // the renderer filters on the ['materias'] facts).
  it('hides the classes of a subject that no longer attends', async () => {
    const closed: SubjectWithSlots = {
      ...sampleSubjects[0]!,
      id: 2,
      name: 'Redes',
      code: 'RD-301',
      slots: [{ id: 2, subjectId: 2, dayOfWeek: 2, startMinutes: 600, endMinutes: 690, location: null }]
    }
    vi.mocked(horarioApi.week).mockResolvedValue([...sampleSubjects, closed])
    vi.mocked(materiasApi.list).mockResolvedValue([
      makeFacts(sampleSubjects[0]!),
      makeFacts(closed, { outcome: 'aprobada' })
    ])

    renderWithClient(<HorarioContainer now={new Date('2026-03-04T09:00:00')} />)

    expect(await screen.findByText('Sistemas Operativos')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Redes')).not.toBeInTheDocument())
  })

  it('never writes the schedule from this screen', async () => {
    renderWithClient(<HorarioContainer now={new Date('2026-03-04T09:00:00')} />)

    fireEvent.click(await screen.findByTestId('horario-class-block'))
    await screen.findByRole('dialog', { name: 'Clase' })

    expect(materiasApi.updateSchedule).not.toHaveBeenCalled()
  })

  /*
   * The reason this screen took the class dialog at all: before it, an apunte
   * could ONLY be written from Hoy, which mounts the dialog with today's date.
   * A class that happened on Monday was unreachable from Tuesday onward — the
   * subject detail's APUNTES section is an index of existing apuntes and has
   * no add path by design. The grid is the surface that knows every weekday.
   */
  it('clicking a class block body opens that class dated to the CURRENT week, not to today', async () => {
    // Wednesday. The sample subject's only slot is a Monday one, so the class
    // it opens is two days in the past — exactly the case Hoy cannot reach.
    renderWithClient(<HorarioContainer now={new Date('2026-03-04T09:00:00')} />)

    fireEvent.click(await screen.findByTestId('horario-class-block'))

    const dialog = await screen.findByRole('dialog', { name: 'Clase' })
    expect(dialog).toHaveAttribute('data-date', '2026-03-02')
    expect(dialog).toHaveAttribute('data-subject-id', '1')
  })

  it('reads the class off the subject detail, so the dialog carries its marks and apuntes', async () => {
    renderWithClient(<HorarioContainer now={new Date('2026-03-04T09:00:00')} />)

    fireEvent.click(await screen.findByTestId('horario-class-block'))

    await screen.findByRole('dialog', { name: 'Clase' })
    expect(materiasApi.detail).toHaveBeenCalledWith(1)
  })

  it('closes the class dialog on its own request', async () => {
    renderWithClient(<HorarioContainer now={new Date('2026-03-04T09:00:00')} />)

    fireEvent.click(await screen.findByTestId('horario-class-block'))
    fireEvent.click(await screen.findByText('stub-clase-close'))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  /*
   * The grid is a read-only projection with ONE target per block: the class
   * dialog. It carries no apunte control any more, so this screen never mounts
   * the markdown editor — an apunte is reached from Hoy or from the subject's
   * APUNTES tab.
   */
  it('offers no apunte control on the grid', async () => {
    renderWithClient(<HorarioContainer now={new Date('2026-03-04T09:00:00')} />)

    await screen.findByTestId('horario-class-block')

    expect(screen.queryByTestId('horario-class-apunte')).not.toBeInTheDocument()
  })
})
