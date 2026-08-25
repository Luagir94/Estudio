// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clasesApi } from '../adapters/clasesApi'
import { ClaseModalContainer } from './ClaseModalContainer'

vi.mock('../adapters/clasesApi', () => ({
  clasesApi: {
    setAttendance: vi.fn(),
    clearAttendance: vi.fn(),
    saveNote: vi.fn(),
    deleteNote: vi.fn()
  }
}))

// Thursday 2026-08-13 — the subject's only slot is on a Thursday.
const slots = [{ dayOfWeek: 4, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }]

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function renderModal(
  overrides: { attendanceStatus?: 'presente' | 'ausente' | 'feriado' | null; noteBody?: string } = {}
) {
  const onClose = vi.fn()
  renderWithClient(
    <ClaseModalContainer
      subjectId={7}
      subjectName="Sistemas Operativos"
      date="2026-08-13"
      slots={slots}
      attendanceStatus={overrides.attendanceStatus ?? null}
      noteBody={overrides.noteBody ?? ''}
      onClose={onClose}
    />
  )
  return { onClose }
}

describe('ClaseModalContainer', () => {
  beforeEach(() => {
    // Vitest is not configured to clear mocks between tests, and these
    // assertions are about which command was chosen — a leaked call from the
    // previous test would answer that question wrongly.
    vi.clearAllMocks()
    vi.mocked(clasesApi.setAttendance).mockResolvedValue({
      id: 1,
      subjectId: 7,
      date: '2026-08-13',
      status: 'presente'
    })
    vi.mocked(clasesApi.clearAttendance).mockResolvedValue({ subjectId: 7, date: '2026-08-13' })
    vi.mocked(clasesApi.saveNote).mockResolvedValue({ id: 1, subjectId: 7, date: '2026-08-13', body: 'x' })
    vi.mocked(clasesApi.deleteNote).mockResolvedValue({ subjectId: 7, date: '2026-08-13' })
  })

  // The occurrence is COMPOSED here from the weekly pattern — nothing dated is
  // stored to read a time off.
  it('resolves the class occurrence from the subject`s weekly pattern', () => {
    renderModal()

    expect(screen.getByText('Sistemas Operativos · 08:00 – 09:30 · Aula 204')).toBeInTheDocument()
  })

  it('writes the mark and the apunte for the same (subject, date) pair', async () => {
    renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Presente' }))
    await userEvent.type(screen.getByLabelText('APUNTE DE LA CLASE'), 'Round robin.')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }))

    await waitFor(() =>
      expect(clasesApi.setAttendance).toHaveBeenCalledWith({ subjectId: 7, date: '2026-08-13', status: 'presente' })
    )
    expect(clasesApi.saveNote).toHaveBeenCalledWith({ subjectId: 7, date: '2026-08-13', body: 'Round robin.' })
  })

  // Unmarked is the absence of a row, so "no mark" is a DELETE, not a status
  // value written to the column.
  it('clears the mark rather than writing an empty one', async () => {
    renderModal({ attendanceStatus: 'presente' })

    await userEvent.click(screen.getByRole('button', { name: 'Presente' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }))

    await waitFor(() => expect(clasesApi.clearAttendance).toHaveBeenCalledWith({ subjectId: 7, date: '2026-08-13' }))
    expect(clasesApi.setAttendance).not.toHaveBeenCalled()
  })

  // Same rule for the apunte: an emptied body is a deleted apunte, never a
  // stored blank — that is what keeps "has an apunte" answerable by presence.
  it('deletes the apunte rather than saving a blank one', async () => {
    renderModal({ noteBody: 'Sobra.' })

    await userEvent.clear(screen.getByLabelText('APUNTE DE LA CLASE'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }))

    await waitFor(() => expect(clasesApi.deleteNote).toHaveBeenCalledWith({ subjectId: 7, date: '2026-08-13' }))
    expect(clasesApi.saveNote).not.toHaveBeenCalled()
  })

  it('closes once both writes land', async () => {
    const { onClose } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('keeps the dialog open and reports the failure when a write does not go through', async () => {
    vi.mocked(clasesApi.setAttendance).mockRejectedValue(new Error('database is locked'))
    const { onClose } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Presente' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar clase' }))

    await waitFor(() => expect(screen.queryByText('Una marca y un apunte por clase')).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })
})
