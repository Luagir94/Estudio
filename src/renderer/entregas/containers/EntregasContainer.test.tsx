// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeadlineWithSubject } from '../../../shared/ipc/entregas'
import type { SubjectWithStatus } from '../../../shared/ipc/materias'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { entregasApi } from '../adapters/entregasApi'
import { EntregasContainer } from './EntregasContainer'

vi.mock('../adapters/entregasApi', () => ({
  entregasApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), setDone: vi.fn(), delete: vi.fn() }
}))

vi.mock('../../materias/adapters/materiasApi', () => ({
  materiasApi: { list: vi.fn() }
}))

vi.mock('../components/NuevaEntregaModal', () => ({
  NuevaEntregaModal: ({
    mode,
    onSubmit,
    onClose
  }: {
    mode: string
    onSubmit: (input: unknown) => void
    onClose: () => void
  }) => (
    <div role="dialog">
      <span>stub-modal-{mode}</span>
      <button
        type="button"
        onClick={() => onSubmit({ title: 'Stub', subjectId: 1, type: 'Trabajo práctico', dueAt: '2027-08-18T23:59' })}
      >
        stub-submit
      </button>
      <button type="button" onClick={onClose}>
        stub-close
      </button>
    </div>
  )
}))

const now = new Date(2027, 7, 18, 12, 0)

function makeDeadline(overrides: Partial<DeadlineWithSubject>): DeadlineWithSubject {
  return {
    id: 1,
    subjectId: 1,
    title: 'TP 2 — Scheduler',
    type: 'Trabajo práctico',
    dueAt: '2027-08-22T23:59',
    done: false,
    subjectName: 'Sistemas Operativos',
    subjectColor: '#4c8dff',
    ...overrides
  }
}

// The ['materias'] facts the container filters against (outcome, period
// dates, finals) — the entregas payload only names its subject.
function makeFacts(overrides: Partial<SubjectWithStatus> = {}): SubjectWithStatus {
  return {
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
    slots: [],
    period: null,
    program: null,
    finals: [],
    pendingDeadlines: 1,
    ...overrides
  }
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('EntregasContainer', () => {
  beforeEach(() => {
    vi.mocked(entregasApi.list).mockResolvedValue([makeDeadline({})])
    vi.mocked(entregasApi.update).mockResolvedValue(makeDeadline({}))
    vi.mocked(entregasApi.setDone).mockResolvedValue(makeDeadline({ done: true }))
    vi.mocked(entregasApi.delete).mockResolvedValue({ id: 1 })
    vi.mocked(materiasApi.list).mockResolvedValue([makeFacts()])
  })

  it('fetches on the ["entregas"] query key and renders the resolved deadlines', async () => {
    renderWithClient(<EntregasContainer now={now} />)

    expect(await screen.findByText('TP 2 — Scheduler')).toBeInTheDocument()
    expect(entregasApi.list).toHaveBeenCalledTimes(1)
  })

  it('offers no "Agregar entrega" or equivalent create affordance (amendment 8 — creation moved to subject detail; spec: "Entregas screen offers no create affordance")', async () => {
    renderWithClient(<EntregasContainer now={now} />)

    await screen.findByText('TP 2 — Scheduler')

    expect(screen.queryByRole('button', { name: /agregar entrega/i })).not.toBeInTheDocument()
  })

  // A deadline belongs to the coursework of its subject: once the subject is
  // closed (or waiting on a final), nothing is owed anymore, so the row and
  // the urgency counters both drop it.
  it('hides the deadlines of a subject without open coursework, counters included', async () => {
    vi.mocked(entregasApi.list).mockResolvedValue([
      makeDeadline({}),
      makeDeadline({ id: 2, subjectId: 2, title: 'TP Final — Redes', subjectName: 'Redes', dueAt: '2027-08-10T23:59' })
    ])
    vi.mocked(materiasApi.list).mockResolvedValue([makeFacts(), makeFacts({ id: 2, outcome: 'aprobada' })])

    renderWithClient(<EntregasContainer now={now} />)

    expect(await screen.findByText('TP 2 — Scheduler')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('TP Final — Redes')).not.toBeInTheDocument())
    // The overdue Redes deadline is out of the summary too: 1 pending, 0 overdue.
    expect(screen.getByText('1 pendiente · 0 atrasadas · 0 completadas este cuatrimestre')).toBeInTheDocument()
  })

  it('clicking a deadline row body opens the edit modal', async () => {
    renderWithClient(<EntregasContainer now={now} />)

    fireEvent.click(await screen.findByRole('button', { name: /TP 2 — Scheduler/ }))

    expect(screen.getByText('stub-modal-edit')).toBeInTheDocument()
  })

  it('submitting the edit modal calls entregasApi.update with the deadline id', async () => {
    renderWithClient(<EntregasContainer now={now} />)

    fireEvent.click(await screen.findByRole('button', { name: /TP 2 — Scheduler/ }))
    fireEvent.click(screen.getByText('stub-submit'))

    await waitFor(() => expect(entregasApi.update).toHaveBeenCalledTimes(1))
    expect(vi.mocked(entregasApi.update).mock.calls[0]?.[0]).toMatchObject({ id: 1 })
  })

  it('toggling the done checkbox calls entregasApi.setDone', async () => {
    renderWithClient(<EntregasContainer now={now} />)

    fireEvent.click(await screen.findByRole('checkbox', { name: /marcar como completada/i }))

    await waitFor(() => expect(entregasApi.setDone).toHaveBeenCalledTimes(1))
    expect(vi.mocked(entregasApi.setDone).mock.calls[0]?.[0]).toEqual({ id: 1, done: true })
  })

  it('clicking delete opens a confirmation dialog, and confirming calls entregasApi.delete', async () => {
    renderWithClient(<EntregasContainer now={now} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))
    expect(screen.getByRole('dialog', { name: /TP 2 — Scheduler/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /eliminar entrega/i }))

    await waitFor(() => expect(entregasApi.delete).toHaveBeenCalledTimes(1))
    expect(vi.mocked(entregasApi.delete).mock.calls[0]?.[0]).toBe(1)
  })
})
