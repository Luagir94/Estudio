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
  indexStatus: 'pending',
  origin: 'user',
  classDate: null
}

function renderSection(overrides: Partial<React.ComponentProps<typeof AdjuntosSection>> = {}) {
  const onSync = vi.fn()
  const onNewDocument = vi.fn()
  const onAdd = vi.fn()
  render(
    <AdjuntosSection
      attachments={[sampleAttachment]}
      isLoading={false}
      isError={false}
      missingIds={new Set()}
      addFailures={[]}
      addAttemptedCount={0}
      actionError={null}
      hasSyncableDocuments
      isSyncing={false}
      onAdd={onAdd}
      onNewDocument={onNewDocument}
      onRetry={vi.fn()}
      onOpen={vi.fn()}
      onDelete={vi.fn()}
      onSync={onSync}
      {...overrides}
    />
  )
  return { onSync, onNewDocument, onAdd }
}

// Sincronizar button (design "Approved design", spec "Sincronizar button").
describe('AdjuntosSection — Sincronizar button', () => {
  // Sincronizar is icon-only now (approved design): it is maintenance, not
  // something you come to this section to do, and three labelled buttons in
  // one row was the densest spot on the whole screen. The label survives as
  // the accessible name.
  it('renders the "Sincronizar" button next to "Agregar", visible with a populated list', () => {
    renderSection()

    expect(screen.getByRole('button', { name: 'Sincronizar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeInTheDocument()
  })

  // The list this section shows and the work Sincronizar has to do are two
  // different questions: apuntes are filtered out of the list but still get
  // indexed, so an empty ADJUNTOS can sit on top of a pending apunte.
  it('stays visible on an empty list while something of the materia is still pending', () => {
    renderSection({ attachments: [] })

    expect(screen.getByRole('button', { name: 'Sincronizar' })).toBeInTheDocument()
  })

  it('is not rendered at all when nothing is pending — there is nothing to reintentar', () => {
    renderSection({ hasSyncableDocuments: false })

    expect(screen.queryByRole('button', { name: 'Sincronizar' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(screen.getByRole('menuitem', { name: 'Agregar archivo' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Nuevo documento' })).toBeInTheDocument()
  })

  it('calls onSync when clicked', () => {
    const { onSync } = renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar' }))

    expect(onSync).toHaveBeenCalledTimes(1)
  })

  // Without this the click has no answer at all: the only other feedback is a
  // badge that moves whenever the background job happens to finish.
  it('locks and marks itself busy while the sync is in flight', () => {
    renderSection({ isSyncing: true })

    const button = screen.getByRole('button', { name: 'Sincronizar' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('spins its icon while syncing', () => {
    renderSection({ isSyncing: true })

    expect(screen.getByRole('button', { name: 'Sincronizar' }).querySelector('.animate-spin')).not.toBeNull()
  })

  it('leaves the icon still when idle', () => {
    renderSection()

    expect(screen.getByRole('button', { name: 'Sincronizar' }).querySelector('.animate-spin')).toBeNull()
  })

  it('cannot be fired a second time while the first sync is still running', () => {
    const { onSync } = renderSection({ isSyncing: true })

    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar' }))

    expect(onSync).not.toHaveBeenCalled()
  })

  it('keeps the label unchanged while busy — the spinning icon is the whole signal', () => {
    renderSection({ isSyncing: true })

    expect(screen.getByRole('button', { name: 'Sincronizar' })).toBeInTheDocument()
  })
})

// "Nuevo documento" (approved design — CABECERA DE ADJUNTOS).
// "Nuevo documento" and "Agregar archivo" were two buttons doing one job —
// putting something into ADJUNTOS — which is exactly what made this row the
// busiest on the screen. They share one "+ Agregar" entry point now (approved
// design), and the choice happens inside it.
describe('AdjuntosSection — Agregar menu', () => {
  it('offers both creation paths behind one entry point', () => {
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(screen.getByRole('menuitem', { name: 'Agregar archivo' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Nuevo documento' })).toBeInTheDocument()
  })

  it('is offered on an empty list too — there is always a document you could start', () => {
    renderSection({ attachments: [], hasSyncableDocuments: false })

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(screen.getByRole('menuitem', { name: 'Nuevo documento' })).toBeInTheDocument()
  })

  it('calls onNewDocument when that path is chosen', () => {
    const { onNewDocument } = renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nuevo documento' }))

    expect(onNewDocument).toHaveBeenCalledTimes(1)
  })

  it('calls onAdd when the file path is chosen', () => {
    const { onAdd } = renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Agregar archivo' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})
