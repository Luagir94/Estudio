// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AcademicDateWithProgram } from '../../../shared/ipc/fechas'
import { FechasCardContainer } from './FechasCardContainer'

const { fechasApiMock } = vi.hoisted(() => ({
  fechasApiMock: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
}))

vi.mock('../adapters/fechasApi', () => ({ fechasApi: fechasApiMock }))

const now = new Date(2026, 11, 1, 12, 0)

function makeDate(overrides: Partial<AcademicDateWithProgram> = {}): AcademicDateWithProgram {
  return {
    id: 1,
    programId: 2,
    title: 'Inscripción a finales',
    kind: 'inscripcionFinales',
    startsOn: '2026-12-01',
    endsOn: '2026-12-05',
    programName: 'Abogacía',
    ...overrides
  }
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <FechasCardContainer programId={2} programName="Abogacía" now={now} />
    </QueryClientProvider>
  )
}

describe('FechasCardContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fechasApiMock.list.mockResolvedValue([makeDate()])
    fechasApiMock.create.mockResolvedValue(makeDate({ id: 9 }))
    fechasApiMock.update.mockResolvedValue(makeDate())
    fechasApiMock.delete.mockResolvedValue({ id: 1 })
  })

  it('lists only the dates of its own carrera', async () => {
    fechasApiMock.list.mockResolvedValue([
      makeDate({ id: 1, title: 'Propia' }),
      makeDate({ id: 2, programId: 99, title: 'Ajena', programName: 'Ingeniería en Sistemas' })
    ])

    renderCard()

    expect(await screen.findByText('Propia')).toBeInTheDocument()
    expect(screen.queryByText('Ajena')).not.toBeInTheDocument()
  })

  it('creates a date through the modal and closes it', async () => {
    renderCard()
    await screen.findByText('Inscripción a finales')

    await userEvent.click(screen.getByRole('button', { name: 'Agregar fecha' }))
    await userEvent.type(screen.getByLabelText('TÍTULO'), 'Vencimiento de regularidad')
    await userEvent.type(screen.getByLabelText('DESDE'), '2026-12-20')
    await userEvent.click(screen.getByRole('button', { name: 'Crear fecha' }))

    await waitFor(() =>
      expect(fechasApiMock.create.mock.calls[0]?.[0]).toEqual({
        programId: 2,
        title: 'Vencimiento de regularidad',
        kind: 'inscripcionFinales',
        startsOn: '2026-12-20',
        endsOn: null
      })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('edits an existing date through the same modal, dropping the programId the update never takes', async () => {
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /Inscripción a finales/ }))
    await userEvent.clear(screen.getByLabelText('TÍTULO'))
    await userEvent.type(screen.getByLabelText('TÍTULO'), 'Inscripción a finales — Diciembre')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(fechasApiMock.update.mock.calls[0]?.[0]).toEqual({
        id: 1,
        title: 'Inscripción a finales — Diciembre',
        kind: 'inscripcionFinales',
        startsOn: '2026-12-01',
        endsOn: '2026-12-05'
      })
    )
  })

  it('asks before destroying a date, then deletes it', async () => {
    renderCard()

    await userEvent.click(await screen.findByRole('button', { name: /Inscripción a finales/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar fecha' }))

    expect(await screen.findByText(/¿Eliminar la fecha "Inscripción a finales"\?/)).toBeInTheDocument()
    expect(fechasApiMock.delete).not.toHaveBeenCalled()
    // The confirmation REPLACES the form (same rule as EditarCarreraModal), so
    // the shared label is never ambiguous on screen.
    expect(screen.queryByLabelText('TÍTULO')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar fecha' }))

    await waitFor(() => expect(fechasApiMock.delete.mock.calls[0]?.[0]).toBe(1))
  })

  it('reports a failed write in app-owned copy rather than leaving the form looking broken', async () => {
    // Duck-typed like every `XxxApiError` (`shared/lib/ipcErrorCopy.ts` reads
    // only `code`) — the real class lives in the module this file mocks.
    fechasApiMock.create.mockRejectedValue(Object.assign(new Error('database is locked'), { code: 'CREATE_FAILED' }))

    renderCard()
    await screen.findByText('Inscripción a finales')

    await userEvent.click(screen.getByRole('button', { name: 'Agregar fecha' }))
    await userEvent.type(screen.getByLabelText('TÍTULO'), 'X')
    await userEvent.type(screen.getByLabelText('DESDE'), '2026-12-20')
    await userEvent.click(screen.getByRole('button', { name: 'Crear fecha' }))

    expect(await screen.findByText('No se pudo completar la creación. Probá de nuevo.')).toBeInTheDocument()
  })
})
