// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { AttachmentViewerContainer } from './AttachmentViewerContainer'

const sampleAttachment: Attachment = {
  id: 1,
  subjectId: 42,
  fileName: 'Resumen unidad 3.md',
  mimeType: null,
  sizeBytes: 8397,
  title: null,
  createdAt: '2026-08-18T10:00',
  indexStatus: 'indexed',
  origin: 'user'
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  return { ...result, queryClient, invalidateSpy }
}

function renderViewer(props: Partial<React.ComponentProps<typeof AttachmentViewerContainer>> = {}) {
  return renderWithClient(
    <AttachmentViewerContainer
      attachment={sampleAttachment}
      subjectId={42}
      subjectName="Sistemas Operativos"
      onBack={vi.fn()}
      {...props}
    />
  )
}

beforeEach(() => {
  // Assign onto the REAL jsdom `window` (same rationale as
  // AdjuntosContainer.test.tsx — replacing the global breaks jsdom).
  window.api = {
    adjuntos: {
      list: vi.fn().mockResolvedValue({ ok: true, data: [sampleAttachment] }),
      add: vi.fn(),
      open: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      remove: vi.fn(),
      read: vi.fn().mockResolvedValue({ ok: true, data: { content: '# Resumen unidad 3' } }),
      write: vi.fn().mockResolvedValue({ ok: true, data: { ...sampleAttachment, indexStatus: 'pending' } })
    },
    indexado: {
      sync: vi.fn(),
      onStatusChanged: vi.fn().mockReturnValue(vi.fn())
    },
    materias: {
      create: vi.fn(),
      list: vi.fn(),
      detail: vi.fn(),
      updateSchedule: vi.fn(),
      delete: vi.fn(),
      setOutcome: vi.fn()
    },
    horario: { week: vi.fn() },
    hoy: { dashboard: vi.fn() },
    carreras: {
      create: vi.fn(),
      list: vi.fn(),
      detail: vi.fn(),
      update: vi.fn(),
      createPeriod: vi.fn(),
      updatePeriod: vi.fn(),
      deletePeriod: vi.fn(),
      delete: vi.fn()
    },
    finales: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    entregas: { create: vi.fn(), list: vi.fn(), update: vi.fn(), setDone: vi.fn(), delete: vi.fn() },
    app: { openExternal: vi.fn(), exportJson: vi.fn(), onExportRequested: vi.fn() },
    ask: {
      question: vi.fn(),
      cancel: vi.fn(),
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      deleteConversation: vi.fn()
    },
    cli: { probe: vi.fn(), setOverride: vi.fn(), preferences: vi.fn(), disconnect: vi.fn(), models: vi.fn() }
  }
})

describe('AttachmentViewerContainer — vista', () => {
  it('fetches the content over adjuntos:read and renders it parsed', async () => {
    renderViewer()

    expect(await screen.findByRole('heading', { level: 1, name: 'Resumen unidad 3' })).toBeInTheDocument()
    expect(window.api.adjuntos.read).toHaveBeenCalledWith(1)
  })

  it('shows the missing-file state on ATTACHMENT_FILE_MISSING', async () => {
    window.api.adjuntos.read = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'ATTACHMENT_FILE_MISSING', message: 'gone' } })

    renderViewer()

    expect(
      await screen.findByText('El archivo ya no está en el disco — puede que se haya movido o borrado fuera de la app.')
    ).toBeInTheDocument()
  })

  it('shows the generic error state on any other read failure', async () => {
    window.api.adjuntos.read = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'FILE_TOO_LARGE', message: 'too big' } })

    renderViewer()

    expect(await screen.findByText('No se pudo cargar el documento.')).toBeInTheDocument()
  })

  it('renders the header from the FRESH list row when it differs from the prop snapshot', async () => {
    window.api.adjuntos.list = vi.fn().mockResolvedValue({ ok: true, data: [{ ...sampleAttachment, sizeBytes: 2048 }] })

    renderViewer()

    expect(await screen.findByText('2,0 KB · Editado 18 ago')).toBeInTheDocument()
  })

  it('the external button opens the file with the OS via adjuntos:open', async () => {
    renderViewer()
    await screen.findByRole('heading', { level: 1, name: 'Resumen unidad 3' })

    fireEvent.click(screen.getByRole('button', { name: 'Abrir con la aplicación del sistema' }))

    await waitFor(() => expect(window.api.adjuntos.open).toHaveBeenCalledWith(1))
  })

  it('the back link reports onBack', async () => {
    const onBack = vi.fn()
    renderViewer({ onBack })
    await screen.findByRole('heading', { level: 1, name: 'Resumen unidad 3' })

    fireEvent.click(screen.getByRole('button', { name: 'Sistemas Operativos' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('subscribes to indexado:status-changed and invalidates the adjuntos list for THIS subject', async () => {
    let pushStatusChanged: ((payload: { subjectId: number }) => void) | undefined
    window.api.indexado.onStatusChanged = vi.fn().mockImplementation((callback) => {
      pushStatusChanged = callback
      return vi.fn()
    })

    const { invalidateSpy } = renderViewer()
    await screen.findByRole('heading', { level: 1, name: 'Resumen unidad 3' })

    invalidateSpy.mockClear()
    pushStatusChanged?.({ subjectId: 42 })

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adjuntos', 42] }))
  })
})

describe('AttachmentViewerContainer — edición', () => {
  async function enterEdicion() {
    const rendered = renderViewer()
    await screen.findByRole('heading', { level: 1, name: 'Resumen unidad 3' })
    fireEvent.click(screen.getByRole('button', { name: 'Edición' }))
    return rendered
  }

  it('seeds the draft from the loaded content when entering Edición', async () => {
    await enterEdicion()

    expect(screen.getByRole('textbox', { name: 'Editor de markdown' })).toHaveValue('# Resumen unidad 3')
  })

  it('marks the draft dirty once edited — the "Sin guardar" badge appears', async () => {
    await enterEdicion()

    expect(screen.queryByText('Sin guardar')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Editor de markdown' }), {
      target: { value: '# Editado' }
    })

    expect(screen.getByText('Sin guardar')).toBeInTheDocument()
  })

  it('Guardar cambios writes the draft, invalidates the list and the content, and returns to Vista', async () => {
    const { invalidateSpy } = await enterEdicion()

    fireEvent.change(screen.getByRole('textbox', { name: 'Editor de markdown' }), {
      target: { value: '# Editado' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(window.api.adjuntos.write).toHaveBeenCalledWith(1, '# Editado'))
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adjuntos', 42] }))
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adjunto-contenido', 1] }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Editor de markdown' })).not.toBeInTheDocument())
  })

  it('Cancelar discards the draft and returns to Vista — re-entering re-seeds from the saved content', async () => {
    await enterEdicion()

    fireEvent.change(screen.getByRole('textbox', { name: 'Editor de markdown' }), {
      target: { value: '# Descartado' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('textbox', { name: 'Editor de markdown' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edición' }))
    expect(screen.getByRole('textbox', { name: 'Editor de markdown' })).toHaveValue('# Resumen unidad 3')
  })

  it('a toolbar action transforms the draft through the pure helper and re-applies the selection', async () => {
    window.api.adjuntos.read = vi.fn().mockResolvedValue({ ok: true, data: { content: 'hola mundo' } })
    renderViewer()
    await screen.findByText('hola mundo')
    fireEvent.click(screen.getByRole('button', { name: 'Edición' }))

    const editor = screen.getByRole('textbox', { name: 'Editor de markdown' }) as HTMLTextAreaElement
    editor.setSelectionRange(0, 4)
    fireEvent.click(screen.getByRole('button', { name: 'Negrita' }))

    expect(editor).toHaveValue('**hola** mundo')
    await waitFor(() => {
      expect(editor.selectionStart).toBe(2)
      expect(editor.selectionEnd).toBe(6)
    })
  })
})
