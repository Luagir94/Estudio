// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinalExamRecord } from '../../../shared/ipc/materias'
import { finalesApi } from '../adapters/finalesApi'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { FinalesContainer } from './FinalesContainer'

vi.mock('../adapters/finalesApi', () => ({
  finalesApi: { create: vi.fn(), update: vi.fn(), delete: vi.fn() }
}))

vi.mock('../../materias/adapters/materiasApi', () => ({
  materiasApi: { setOutcome: vi.fn() }
}))

// Every mesa already failed — the one verdict that shows the "Darla por
// reprobada" decision prompt (see FinalsCard.test.tsx).
const allFailedFinals: FinalExamRecord[] = [
  { id: 1, subjectId: 5, label: '1ra mesa', takenOn: null, result: 'reprobado' },
  { id: 2, subjectId: 5, label: '2da mesa', takenOn: null, result: 'reprobado' }
]

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('FinalesContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(materiasApi.setOutcome).mockResolvedValue({
      id: 5,
      name: 'Algoritmos',
      code: 'ALG-101',
      color: '#7c3aed',
      docente: null,
      contacto: null,
      campusUrl: null,
      notas: null,
      attendanceMinPercent: null,
      periodId: null,
      outcome: 'reprobada',
      grade: null,
      slots: [],
      period: null,
      program: null,
      finals: [],
      pendingDeadlines: 0
    })
  })

  // The click on "Darla por reprobada" must only ASK — the outcome cannot
  // change on a single click on a destructive button with no confirmation.
  it('opens the give-up confirmation instead of recording the outcome directly', () => {
    renderWithClient(<FinalesContainer subjectId={5} subjectName="Algoritmos" finals={allFailedFinals} />)

    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))

    expect(screen.getByRole('dialog', { name: 'Dar por reprobada Algoritmos' })).toBeInTheDocument()
    expect(materiasApi.setOutcome).not.toHaveBeenCalled()
  })

  it('cancelling closes the dialog and leaves the outcome untouched', () => {
    renderWithClient(<FinalesContainer subjectId={5} subjectName="Algoritmos" finals={allFailedFinals} />)

    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))
    const dialog = screen.getByRole('dialog', { name: 'Dar por reprobada Algoritmos' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(materiasApi.setOutcome).not.toHaveBeenCalled()
  })

  it('confirming calls materiasApi.setOutcome with the reprobada outcome and closes the dialog', async () => {
    renderWithClient(<FinalesContainer subjectId={5} subjectName="Algoritmos" finals={allFailedFinals} />)

    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))
    const dialog = screen.getByRole('dialog', { name: 'Dar por reprobada Algoritmos' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Darla por reprobada' }))

    await waitFor(() => {
      expect(vi.mocked(materiasApi.setOutcome).mock.calls[0]?.[0]).toEqual({ id: 5, outcome: 'reprobada', grade: null })
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('never calls finalesApi mutations when only opening or cancelling the give-up dialog', () => {
    renderWithClient(<FinalesContainer subjectId={5} subjectName="Algoritmos" finals={allFailedFinals} />)

    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))
    const dialog = screen.getByRole('dialog', { name: 'Dar por reprobada Algoritmos' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(finalesApi.create).not.toHaveBeenCalled()
    expect(finalesApi.update).not.toHaveBeenCalled()
    expect(finalesApi.delete).not.toHaveBeenCalled()
  })
})
