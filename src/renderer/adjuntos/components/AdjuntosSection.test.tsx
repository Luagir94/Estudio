// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { AdjuntosSection } from './AdjuntosSection'

const sampleAttachment: Attachment = {
  id: 1,
  subjectId: 42,
  fileName: 'apuntes.pdf',
  mimeType: null,
  sizeBytes: 2_516_582,
  title: null,
  createdAt: '2026-08-12T10:00',
  indexStatus: 'pending'
}

function renderSection(overrides: Partial<React.ComponentProps<typeof AdjuntosSection>> = {}) {
  const onSync = vi.fn()
  render(
    <AdjuntosSection
      attachments={[sampleAttachment]}
      isLoading={false}
      isError={false}
      missingIds={new Set()}
      addFailures={[]}
      addAttemptedCount={0}
      actionError={null}
      onAdd={vi.fn()}
      onRetry={vi.fn()}
      onOpen={vi.fn()}
      onDelete={vi.fn()}
      onSync={onSync}
      {...overrides}
    />
  )
  return { onSync }
}

// Sincronizar button (design "Approved design", spec "Sincronizar button").
describe('AdjuntosSection — Sincronizar button', () => {
  it('renders the "Sincronizar" button next to "Agregar archivo", visible with a populated list', () => {
    renderSection()

    expect(screen.getByRole('button', { name: 'Sincronizar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar archivo' })).toBeInTheDocument()
  })

  it('is visible regardless of list state (empty list)', () => {
    renderSection({ attachments: [] })

    expect(screen.getByRole('button', { name: 'Sincronizar' })).toBeInTheDocument()
  })

  it('calls onSync when clicked', () => {
    const { onSync } = renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar' }))

    expect(onSync).toHaveBeenCalledTimes(1)
  })
})
