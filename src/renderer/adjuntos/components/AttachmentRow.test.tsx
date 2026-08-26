// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { AttachmentRow } from './AttachmentRow'

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 1,
    subjectId: 42,
    fileName: 'apuntes.pdf',
    mimeType: null,
    sizeBytes: 2_516_582,
    title: null,
    createdAt: '2026-08-12T10:00',
    indexStatus: 'pending',
    origin: 'user',
    classDate: null,
    ...overrides
  }
}

function renderRow(overrides: Partial<Attachment> = {}) {
  return render(
    <AttachmentRow attachment={attachment(overrides)} isMissing={false} onOpen={vi.fn()} onDelete={vi.fn()} />
  )
}

// Index status badge (design "Approved design — Attachment row", spec "Index
// status badge"): 3 closed-set states, each with its own label and icon —
// `svg.lucide-{name}` is lucide-react's own auto-generated identity class,
// not a styling/Tailwind class, so asserting it proves the RIGHT icon
// rendered, not a smoke test.
describe('AttachmentRow — index status badge', () => {
  it('shows "Indexado" with the check icon when the attachment is indexed', () => {
    const { container } = renderRow({ indexStatus: 'indexed' })

    expect(screen.getByText('Indexado')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-check')).not.toBeNull()
  })

  it('shows "Pendiente" with the hourglass icon when the attachment is pending', () => {
    const { container } = renderRow({ indexStatus: 'pending' })

    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-hourglass')).not.toBeNull()
  })

  it('shows "No indexable" with the search-x icon when the attachment is not indexable', () => {
    const { container } = renderRow({ indexStatus: 'not-indexable' })

    expect(screen.getByText('No indexable')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-search-x')).not.toBeNull()
  })

  it('renders a DIFFERENT badge label per status on the SAME row shape (not a hardcoded single case)', () => {
    const { unmount } = renderRow({ indexStatus: 'indexed' })
    expect(screen.queryByText('Pendiente')).not.toBeInTheDocument()
    unmount()

    renderRow({ indexStatus: 'pending' })
    expect(screen.queryByText('Indexado')).not.toBeInTheDocument()
  })
})

// AI-generated provenance badge (cli-generated-artifacts spec "Origin
// provenance column and badge") — renders BESIDE the existing indexStatus
// badge, only for `origin: 'ai-generated', classDate: null`.
describe('AttachmentRow — origin badge', () => {
  it('shows the IA badge alongside the index status badge for an ai-generated attachment', () => {
    const { container } = renderRow({ origin: 'ai-generated', classDate: null, indexStatus: 'pending' })

    expect(screen.getByText('IA')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-sparkles')).not.toBeNull()
    // The index status badge still renders — the IA badge is additive, not a replacement.
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
  })

  it('does not show the IA badge for a normal user upload', () => {
    renderRow({ origin: 'user', classDate: null })

    expect(screen.queryByText('IA')).not.toBeInTheDocument()
  })
})
