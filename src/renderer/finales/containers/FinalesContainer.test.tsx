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

  // Escape must be the same safe exit as Cancel: the dialog closes and the
  // destructive mutation never fires.
  it('Escape closes the give-up dialog without recording the outcome', () => {
    renderWithClient(<FinalesContainer subjectId={5} subjectName="Algoritmos" finals={allFailedFinals} />)

    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))
    const dialog = screen.getByRole('dialog', { name: 'Dar por reprobada Algoritmos' })
    fireEvent.keyDown(dialog, { key: 'Escape' })

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

  // A write that fails and says nothing reads as a dead button — the same
  // rule the carreras containers already follow (CarreraDetailContainer).
  // Every copy assertion below is app-owned Spanish from ipcErrorCopy, never
  // the raw IPC message.
  const GENERIC_ERROR = 'Ocurrió un error inesperado. Probá de nuevo en un momento.'

  function openAddModal(): HTMLElement {
    renderWithClient(<FinalesContainer subjectId={5} subjectName="Algoritmos" finals={allFailedFinals} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }))
    return screen.getByRole('dialog', { name: 'Nueva mesa de final' })
  }

  async function submitNewInstance(dialog: HTMLElement): Promise<void> {
    fireEvent.change(within(dialog).getByLabelText('Nombre de la mesa'), { target: { value: '3ra mesa' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar mesa' }))
    await waitFor(() => expect(finalesApi.create).toHaveBeenCalled())
  }

  it('says why the mesa could not be created and keeps the modal open', async () => {
    vi.mocked(finalesApi.create).mockRejectedValue(new Error('boom'))
    const dialog = openAddModal()

    await submitNewInstance(dialog)

    expect(await screen.findByText(GENERIC_ERROR)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Nueva mesa de final' })).toBeInTheDocument()
  })

  it('disables the create submit button while the mutation is in flight', async () => {
    vi.mocked(finalesApi.create).mockReturnValue(new Promise(() => {}))
    const dialog = openAddModal()

    await submitNewInstance(dialog)

    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Agregar mesa' })).toBeDisabled())
  })

  // The result chips fire the update straight from the row (no dialog), so
  // the failure has to surface as a banner next to the list — and the mapped
  // copy for the error's CODE, not the generic fallback, proves the whole
  // FinalesApiError → describeIpcError chain is wired.
  it('surfaces the mapped copy when setting a result fails', async () => {
    vi.mocked(finalesApi.update).mockRejectedValue(Object.assign(new Error('SQLITE_BUSY'), { code: 'UPDATE_FAILED' }))
    renderWithClient(<FinalesContainer subjectId={5} subjectName="Algoritmos" finals={allFailedFinals} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Aprobado' })[0]!)

    expect(await screen.findByText('No se pudieron guardar los cambios. Probá de nuevo.')).toBeInTheDocument()
  })

  it('says why the mesa could not be deleted instead of failing silently', async () => {
    vi.mocked(finalesApi.delete).mockRejectedValue(new Error('boom'))
    renderWithClient(<FinalesContainer subjectId={5} subjectName="Algoritmos" finals={allFailedFinals} />)

    fireEvent.click(screen.getByRole('button', { name: 'Borrar 1ra mesa' }))

    expect(await screen.findByText(GENERIC_ERROR)).toBeInTheDocument()
  })

  it('says why the give-up could not be recorded and keeps the dialog open', async () => {
    vi.mocked(materiasApi.setOutcome).mockRejectedValue(new Error('boom'))
    renderWithClient(<FinalesContainer subjectId={5} subjectName="Algoritmos" finals={allFailedFinals} />)

    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))
    const dialog = screen.getByRole('dialog', { name: 'Dar por reprobada Algoritmos' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Darla por reprobada' }))

    expect(await within(dialog).findByText(GENERIC_ERROR)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Dar por reprobada Algoritmos' })).toBeInTheDocument()
  })

  it('disables the give-up confirm button while the mutation is in flight', async () => {
    vi.mocked(materiasApi.setOutcome).mockReturnValue(new Promise(() => {}))
    renderWithClient(<FinalesContainer subjectId={5} subjectName="Algoritmos" finals={allFailedFinals} />)

    fireEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))
    const dialog = screen.getByRole('dialog', { name: 'Dar por reprobada Algoritmos' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Darla por reprobada' }))

    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Darla por reprobada' })).toBeDisabled())
  })
})
