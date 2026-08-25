// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import { CarrerasContainer } from './CarrerasContainer'

const { carrerasApiMock } = vi.hoisted(() => ({
  carrerasApiMock: { list: vi.fn(), create: vi.fn(), detail: vi.fn(), createPeriod: vi.fn(), delete: vi.fn() }
}))

vi.mock('../adapters/carrerasApi', () => ({ carrerasApi: carrerasApiMock }))

const today = new Date(2026, 7, 15)

const abogacia: ProgramWithPeriods = {
  id: 1,
  name: 'Abogacía',
  institution: 'Universidad de Buenos Aires',
  color: '#4C8DFF',
  gradingScheme: 'numerico',
  gradeScale: 10,
  periods: [],
  subjectCount: 0,
  gradedSubjects: []
}

function renderContainer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CarrerasContainer now={today} />
    </QueryClientProvider>
  )
}

describe('CarrerasContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    carrerasApiMock.list.mockResolvedValue([abogacia])
    carrerasApiMock.create.mockResolvedValue({ ...abogacia, id: 2 })
  })

  it('lists the programs it fetched', async () => {
    renderContainer()

    expect(await screen.findByText('Abogacía')).toBeInTheDocument()
    expect(screen.getByText(/1 carrera ·/)).toBeInTheDocument()
  })

  it('reports a failed fetch instead of rendering an empty list', async () => {
    carrerasApiMock.list.mockRejectedValue(new Error('boom'))

    renderContainer()

    expect(await screen.findByText('No se pudieron cargar las carreras.')).toBeInTheDocument()
  })

  it('invites the user to start when there are no programs', async () => {
    carrerasApiMock.list.mockResolvedValue([])

    renderContainer()

    expect(await screen.findByText(/Todavía no agregaste ninguna carrera/)).toBeInTheDocument()
  })

  it('creates a numeric program with its scale', async () => {
    renderContainer()
    await screen.findByText('Abogacía')

    await userEvent.click(screen.getByRole('button', { name: 'Agregar carrera' }))
    await userEvent.type(screen.getByLabelText('NOMBRE'), 'Medicina')
    await userEvent.click(screen.getByRole('button', { name: 'Crear carrera' }))

    // TanStack Query calls the mutationFn with (variables, context), so the
    // assertion targets the first argument rather than the whole call.
    await waitFor(() => {
      expect(carrerasApiMock.create.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ name: 'Medicina', gradingScheme: 'numerico', gradeScale: 10 })
      )
    })
  })

  it('drops the scale when the program is switched to pass/fail', async () => {
    renderContainer()
    await screen.findByText('Abogacía')

    await userEvent.click(screen.getByRole('button', { name: 'Agregar carrera' }))
    await userEvent.type(screen.getByLabelText('NOMBRE'), 'Curso de Bartender')
    await userEvent.click(screen.getByRole('button', { name: 'Aprobado / Desaprobado' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear carrera' }))

    await waitFor(() => {
      expect(carrerasApiMock.create.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ gradingScheme: 'binario', gradeScale: null })
      )
    })
  })

  it('hides the scale field for a pass/fail program', async () => {
    renderContainer()
    await screen.findByText('Abogacía')

    await userEvent.click(screen.getByRole('button', { name: 'Agregar carrera' }))
    expect(screen.getByLabelText('ESCALA')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Aprobado / Desaprobado' }))

    expect(screen.queryByLabelText('ESCALA')).not.toBeInTheDocument()
  })

  it('does not submit a program with no name', async () => {
    renderContainer()
    await screen.findByText('Abogacía')

    await userEvent.click(screen.getByRole('button', { name: 'Agregar carrera' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear carrera' }))

    await waitFor(() => {
      expect(screen.getByText('Poné un nombre')).toBeInTheDocument()
    })
    expect(carrerasApiMock.create).not.toHaveBeenCalled()
  })

  it('closes the modal once the program was created', async () => {
    renderContainer()
    await screen.findByText('Abogacía')

    await userEvent.click(screen.getByRole('button', { name: 'Agregar carrera' }))
    await userEvent.type(screen.getByLabelText('NOMBRE'), 'Medicina')
    await userEvent.click(screen.getByRole('button', { name: 'Crear carrera' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Nueva carrera' })).not.toBeInTheDocument()
    })
  })
})
