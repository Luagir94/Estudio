// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { adjuntosApi } from '../../adjuntos/adapters/adjuntosApi'
import { ApuntesContainer } from './ApuntesContainer'

vi.mock('../../adjuntos/adapters/adjuntosApi', () => ({
  adjuntosApi: { list: vi.fn() }
}))

const notes = [{ id: 9, subjectId: 7, date: '2026-08-13', preview: 'Round robin y starvation.' }]

const apunteAttachment: Attachment = {
  id: 9,
  subjectId: 7,
  fileName: 'apunte-2026-08-13.md',
  mimeType: null,
  sizeBytes: 120,
  title: 'Round robin y starvation.',
  createdAt: '2026-08-13T10:00',
  indexStatus: 'indexed',
  origin: 'class-note',
  classDate: '2026-08-13'
}

function renderContainer(onOpenApunte = vi.fn(), ui?: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      {ui ?? <ApuntesContainer subjectId={7} notes={notes} onOpenApunte={onOpenApunte} />}
    </QueryClientProvider>
  )
  return { onOpenApunte }
}

describe('ApuntesContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adjuntosApi.list).mockResolvedValue([apunteAttachment])
  })

  /*
   * An apunte is a markdown ATTACHMENT, so opening one hands its attachment
   * to the screen that swaps itself for the editor — the same editor an .md
   * upload opens. One editor, one save path, one place its text can change.
   */
  it('opens the apunte in the markdown editor', async () => {
    const { onOpenApunte } = renderContainer()

    await userEvent.click(await screen.findByTestId('subject-detail-apunte'))

    await waitFor(() => expect(onOpenApunte).toHaveBeenCalledWith(apunteAttachment))
  })

  /*
   * The attachment carries the size and index status the editor's header
   * renders. Synthesising one from the note record would put invented numbers
   * on screen, so a row whose attachment has not arrived simply does not open.
   */
  it('does not open an apunte whose attachment has not arrived', async () => {
    vi.mocked(adjuntosApi.list).mockResolvedValue([])
    const { onOpenApunte } = renderContainer()

    await userEvent.click(await screen.findByTestId('subject-detail-apunte'))

    expect(onOpenApunte).not.toHaveBeenCalled()
  })

  it('renders the stored preview line for each apunte', async () => {
    renderContainer()

    expect(await screen.findByText('Round robin y starvation.')).toBeInTheDocument()
  })

  /*
   * There is no add path, and that is the design: an apunte belongs to a
   * CLASS, and this section knows only which classes already have one.
   */
  it('offers no way to create an apunte from the list', () => {
    renderContainer()

    expect(screen.queryByRole('button', { name: /agregar apunte/i })).not.toBeInTheDocument()
  })
})
