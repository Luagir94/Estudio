// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectDetailResult, SubjectWithSlots } from '../../../shared/ipc/materias'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { horarioApi } from '../adapters/horarioApi'
import { HorarioContainer } from './HorarioContainer'

vi.mock('../adapters/horarioApi', () => ({
  horarioApi: { week: vi.fn() }
}))

vi.mock('../../materias/adapters/materiasApi', () => ({
  materiasApi: { detail: vi.fn(), updateSchedule: vi.fn() }
}))

vi.mock('../../materias/components/EditarMateriaModal', () => ({
  EditarMateriaModal: ({
    initialTab,
    onSubmit,
    onClose
  }: {
    initialTab?: string
    onSubmit: (input: unknown) => void
    onClose: () => void
  }) => (
    <div role="dialog" aria-label="Editar materia" data-initial-tab={initialTab}>
      <button type="button" onClick={() => onSubmit({ id: 1, name: 'Stub', code: 'STUB', color: '#000', slots: [] })}>
        stub-edit-submit
      </button>
      <button type="button" onClick={onClose}>
        stub-edit-close
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
    campusUrl: null,
    notas: null,
    attendanceMinPercent: null,
    periodId: null,
    outcome: null,
    grade: null,
    slots: [{ id: 1, subjectId: 1, dayOfWeek: 1, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }]
  }
]

const sampleDetail: SubjectDetailResult = {
  ...sampleSubjects[0]!,
  deadlines: [],
  period: null,
  program: null,
  finals: []
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('HorarioContainer', () => {
  beforeEach(() => {
    vi.mocked(horarioApi.week).mockResolvedValue(sampleSubjects)
    vi.mocked(materiasApi.detail).mockResolvedValue(sampleDetail)
    vi.mocked(materiasApi.updateSchedule).mockResolvedValue(sampleSubjects[0]!)
  })

  it('fetches on the ["horario","week"] query key and renders the grid with the projected class', async () => {
    renderWithClient(<HorarioContainer now={new Date('2026-03-04T09:00:00')} />)

    expect(await screen.findByText('Sistemas Operativos')).toBeInTheDocument()
    expect(horarioApi.week).toHaveBeenCalledTimes(1)
  })

  it('clicking a class block fetches the subject detail and opens Editar materia on the Horario tab', async () => {
    renderWithClient(<HorarioContainer now={new Date('2026-03-04T09:00:00')} />)

    fireEvent.click(await screen.findByRole('button', { name: /Sistemas Operativos/ }))

    expect(await screen.findByRole('dialog', { name: 'Editar materia' })).toHaveAttribute('data-initial-tab', 'horario')
    expect(materiasApi.detail).toHaveBeenCalledWith(1)
  })

  it('submitting the modal calls materiasApi.updateSchedule and closes it', async () => {
    renderWithClient(<HorarioContainer now={new Date('2026-03-04T09:00:00')} />)

    fireEvent.click(await screen.findByRole('button', { name: /Sistemas Operativos/ }))
    fireEvent.click(await screen.findByText('stub-edit-submit'))

    await waitFor(() => expect(materiasApi.updateSchedule).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
