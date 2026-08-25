// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApuntesContainer } from './ApuntesContainer'

vi.mock('../adapters/clasesApi', () => ({
  clasesApi: { setAttendance: vi.fn(), clearAttendance: vi.fn(), saveNote: vi.fn(), deleteNote: vi.fn() }
}))

// The subject meets on Thursdays; 2026-08-13 is a Thursday.
const slots = [{ dayOfWeek: 4, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }]

const notes = [{ id: 1, subjectId: 7, date: '2026-08-13', body: 'Round robin y starvation.' }]

function renderContainer(attendance: Array<{ id: number; subjectId: number; date: string; status: 'presente' }> = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ApuntesContainer
        subjectId={7}
        subjectName="Sistemas Operativos"
        slots={slots}
        notes={notes}
        attendance={attendance}
      />
    </QueryClientProvider>
  )
}

describe('ApuntesContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the class dialog for the apunte`s own date, prefilled with its body', async () => {
    renderContainer()

    await userEvent.click(screen.getByTestId('subject-detail-apunte'))

    expect(await screen.findByRole('dialog', { name: 'Clase del jueves 13 de agosto' })).toBeInTheDocument()
    expect(screen.getByLabelText('APUNTE DE LA CLASE')).toHaveValue('Round robin y starvation.')
  })

  // The dialog edits the WHOLE class, so opening it from an apunte row must
  // carry the mark that class already has — otherwise saving would silently
  // clear it.
  it('carries the mark the class already has into the dialog', async () => {
    renderContainer([{ id: 1, subjectId: 7, date: '2026-08-13', status: 'presente' }])

    await userEvent.click(screen.getByTestId('subject-detail-apunte'))

    expect(await screen.findByRole('button', { name: 'Presente' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('closes the dialog from Cancelar', async () => {
    renderContainer()

    await userEvent.click(screen.getByTestId('subject-detail-apunte'))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
