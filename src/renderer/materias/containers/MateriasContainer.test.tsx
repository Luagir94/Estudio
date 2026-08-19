// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MateriasContainer } from './MateriasContainer'

vi.mock('./MateriasListContainer', () => ({
  MateriasListContainer: ({ onSelectSubject }: { onSelectSubject: (id: number) => void }) => (
    <button type="button" onClick={() => onSelectSubject(42)}>
      stub-select-subject
    </button>
  )
}))

vi.mock('./SubjectDetailContainer', () => ({
  SubjectDetailContainer: ({ subjectId, onBack }: { subjectId: number; onBack: () => void }) => (
    <div>
      <p>stub-detail-for-{subjectId}</p>
      <button type="button" onClick={onBack}>
        stub-back
      </button>
    </div>
  )
}))

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('MateriasContainer (list <-> detail navigation, deferred routing per slice 2a deviation log)', () => {
  it('renders the list by default', () => {
    renderWithClient(<MateriasContainer />)

    expect(screen.getByText('stub-select-subject')).toBeInTheDocument()
  })

  it('shows the detail view for the selected subject after clicking one in the list', () => {
    renderWithClient(<MateriasContainer />)

    fireEvent.click(screen.getByText('stub-select-subject'))

    expect(screen.getByText('stub-detail-for-42')).toBeInTheDocument()
  })

  it('returns to the list when the detail view calls onBack', () => {
    renderWithClient(<MateriasContainer />)
    fireEvent.click(screen.getByText('stub-select-subject'))

    fireEvent.click(screen.getByText('stub-back'))

    expect(screen.getByText('stub-select-subject')).toBeInTheDocument()
  })

  // Entry point for the cross-screen handover: Carreras asks App to open a
  // subject, and App mounts this container already pointing at it.
  it('opens straight into the subject it was handed', () => {
    renderWithClient(<MateriasContainer initialSubjectId={42} />)

    expect(screen.getByText('stub-detail-for-42')).toBeInTheDocument()
  })

  it('still walks back to the list from a handed-over subject', () => {
    renderWithClient(<MateriasContainer initialSubjectId={42} />)

    fireEvent.click(screen.getByText('stub-back'))

    expect(screen.getByText('stub-select-subject')).toBeInTheDocument()
  })
})
