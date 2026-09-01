// @vitest-environment jsdom
// The router against the REAL containers, which is the one thing
// `App.test.tsx` cannot do: every screen is stubbed there, so a click on a
// stub calls `onTabChange` directly and the address is written no matter what
// the container would have done with the props it was handed.
//
// That gap hid a defect that defeated the whole point of putting screen state
// in the address. `useOptionalControlled` hands control to the caller only
// when BOTH halves arrive, and a route whose search param is ABSENT yields
// `undefined` for it — so entering a carrera with no `?tab=` and clicking a
// tab moved the container's own state and never touched the URL. The address
// only ever caught up on a screen that already had the param, which is the
// case no test covered.
//
// Only the adapters are mocked here: the containers, the route components and
// the history are all real, so these tests fail if any link in that chain
// stops writing the address.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgramWithPeriods } from '../shared/ipc/carreras'
import type { SubjectDetailResult, SubjectWithStatus } from '../shared/ipc/materias'
import { App } from './App'

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

const { planificadorApiMock } = vi.hoisted(() => ({
  planificadorApiMock: { list: vi.fn(), addEntry: vi.fn(), removeEntry: vi.fn() }
}))

vi.mock('./carreras/adapters/carrerasApi', () => ({ carrerasApi: carrerasApiMock }))
vi.mock('./materias/adapters/materiasApi', () => ({ materiasApi: materiasApiMock }))
vi.mock('./fechas/adapters/fechasApi', () => ({ fechasApi: fechasApiMock }))
vi.mock('./planificador/adapters/planificadorApi', () => ({ planificadorApi: planificadorApiMock }))

// Shell chrome, not a screen: the Ask panel opens its own conversation and
// polls the CLI, neither of which a routing test has anything to say about.
vi.mock('./ask/containers/AskPanelContainer', () => ({ AskPanelContainer: () => null }))
vi.mock('./shared/adapters/appApi', () => ({
  appApi: { exportJson: vi.fn(), onExportRequested: vi.fn(() => vi.fn()) }
}))

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
    }
  ],
  subjectCount: 1,
  gradedSubjects: []
}

const aprobada: SubjectWithStatus = {
  id: 3,
  name: 'Historia del Derecho',
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
  periodId: 1,
  programId: 1,
  nivel: null,
  outcome: 'aprobada',
  grade: 8,
  regularity: null,
  slots: [],
  period: { id: 1, name: '1er cuatrimestre', startsOn: '2026-03-09', endsOn: '2026-07-18' },
  program: { id: 1, name: 'Abogacía', gradingScheme: 'numerico', gradeScale: 10 },
  finals: [],
  pendingDeadlines: 0,
  prerequisites: []
}

// `materiasApi.detail` payload for `aprobada` — needed for the subject-detail
// tab regression below, which has to mount the REAL subject detail screen
// rather than the list.
const historiaDetail: SubjectDetailResult = {
  id: 3,
  name: 'Historia del Derecho',
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
  periodId: 1,
  programId: 1,
  nivel: null,
  outcome: 'aprobada',
  grade: 8,
  regularity: null,
  slots: [],
  deadlines: [],
  period: { id: 1, name: '1er cuatrimestre', startsOn: '2026-03-09', endsOn: '2026-07-18' },
  program: { id: 1, name: 'Abogacía', gradingScheme: 'numerico', gradeScale: 10 },
  finals: [],
  parciales: [],
  attendance: [],
  classNotes: [],
  prerequisites: []
}

/** Puts the window on a hash location, the way a reload or a deep link would. */
function startAt(hashPath: string): void {
  window.history.replaceState(null, '', `/#${hashPath}`)
}

describe('router, against the real screens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
    carrerasApiMock.list.mockResolvedValue([])
    carrerasApiMock.detail.mockResolvedValue(abogacia)
    materiasApiMock.list.mockResolvedValue([aprobada])
    fechasApiMock.list.mockResolvedValue([])
    planificadorApiMock.list.mockResolvedValue([])
  })

  // THE case the address is for: nothing in the app links to a carrera with a
  // `?tab=` already on it, so the very first tab click is always made from an
  // address that carries none. If that click does not reach the URL, nothing
  // downstream — a reload, a Back that returns to the tab you left — has a tab
  // to work from.
  it('writes the carrera tab into the address on the first click, starting with no ?tab=', async () => {
    startAt('/carreras/1')
    render(<App />)
    await screen.findByRole('heading', { name: 'Abogacía' })

    await userEvent.click(screen.getByRole('tab', { name: 'Plan de estudios' }))

    await waitFor(() => expect(window.location.hash).toContain('tab=plan'))
  })

  // The same defect, one screen older: the Materias list is always entered
  // from the sidebar, which links to a bare `/materias`, so the first chip
  // click is likewise always made with no `?filtro=` to start from.
  it('writes the chosen filter into the address on the first click, starting with no ?filtro=', async () => {
    startAt('/materias')
    render(<App />)
    await screen.findByRole('heading', { name: 'Materias' })

    await userEvent.click(await screen.findByRole('button', { name: /^Aprobadas/ }))

    await waitFor(() => expect(window.location.hash).toContain('filtro=aprobadas'))
  })

  // The third `useOptionalControlled`-defect call site, proven the same way
  // as the two above: nothing links to a subject with a `?tab=` already on
  // it — the Materias list and every carrera/período row open one bare — so
  // the first tab click is always made from an address with none.
  it('writes the subject-detail tab into the address on the first click, starting with no ?tab=', async () => {
    materiasApiMock.detail.mockResolvedValue(historiaDetail)
    startAt('/materias/3')
    render(<App />)
    await screen.findByRole('heading', { name: 'Historia del Derecho' })

    await userEvent.click(screen.getByRole('tab', { name: 'Parciales' }))

    await waitFor(() => expect(window.location.hash).toContain('tab=parciales'))
  })
})
