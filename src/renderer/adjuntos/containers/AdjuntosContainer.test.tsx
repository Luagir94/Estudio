// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdjuntosContainer } from './AdjuntosContainer'

const sampleAttachment = {
  id: 1,
  subjectId: 42,
  fileName: 'apuntes.pdf',
  mimeType: null,
  sizeBytes: 2_516_582,
  title: null,
  createdAt: '2026-08-12T10:00',
  indexStatus: 'pending'
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  return { ...result, queryClient, invalidateSpy }
}

beforeEach(() => {
  // Assign onto the REAL jsdom `window` (not `globalThis.window = {...}`) —
  // replacing the whole global breaks jsdom's internal `document` wiring,
  // which testing-library's bare `waitFor` (unlike `screen`-bound queries)
  // re-resolves on every call.
  window.api = {
    adjuntos: {
      list: vi.fn().mockResolvedValue({ ok: true, data: [sampleAttachment] }),
      add: vi.fn(),
      open: vi.fn(),
      remove: vi.fn()
    },
    indexado: {
      sync: vi.fn().mockResolvedValue({ ok: true, data: { enqueued: 0 } }),
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

describe('AdjuntosContainer', () => {
  it('fetches on the ["adjuntos", subjectId] query key', async () => {
    renderWithClient(<AdjuntosContainer subjectId={42} />)

    await screen.findByText('apuntes.pdf')
    expect(window.api.adjuntos.list).toHaveBeenCalledWith(42)
  })

  it('renders the loading (skeleton) state before the query resolves', async () => {
    const pending = deferred<{ ok: true; data: (typeof sampleAttachment)[] }>()
    window.api.adjuntos.list = vi.fn().mockReturnValue(pending.promise)

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AdjuntosContainer subjectId={42} />
      </QueryClientProvider>
    )

    expect(screen.getAllByTestId('adjuntos-skeleton-row')).toHaveLength(3)
    expect(screen.queryByText('Todavía no hay archivos')).not.toBeInTheDocument()

    pending.resolve({ ok: true, data: [] })
    await waitFor(() => expect(screen.queryAllByTestId('adjuntos-skeleton-row')).toHaveLength(0))
  })

  it('renders the empty state when the subject has no attachments', async () => {
    window.api.adjuntos.list = vi.fn().mockResolvedValue({ ok: true, data: [] })

    renderWithClient(<AdjuntosContainer subjectId={42} />)

    expect(await screen.findByText('Todavía no hay archivos')).toBeInTheDocument()
    expect(screen.getByText('Sumá apuntes, PDFs o fotos del pizarrón.')).toBeInTheDocument()
  })

  it('renders the error state and retries the query when "Reintentar" is clicked', async () => {
    window.api.adjuntos.list = vi.fn().mockRejectedValue(new Error('LIST_FAILED'))

    renderWithClient(<AdjuntosContainer subjectId={42} />)

    expect(await screen.findByText('No se pudieron cargar los adjuntos')).toBeInTheDocument()
    expect(window.api.adjuntos.list).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(window.api.adjuntos.list).toHaveBeenCalledTimes(2))
  })

  it('renders the resolved attachment row with its formatted meta line', async () => {
    renderWithClient(<AdjuntosContainer subjectId={42} />)

    expect(await screen.findByText('apuntes.pdf')).toBeInTheDocument()
    expect(screen.getByText('2,4 MB · 12 ago')).toBeInTheDocument()
  })

  it('adding files invalidates ONLY the ["adjuntos", subjectId] query, driven by the real per-file failures', async () => {
    window.api.adjuntos.add = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        canceled: false,
        added: [sampleAttachment],
        failures: [
          { fileName: 'Clase 4.mp4', code: 'FILE_TOO_LARGE', message: 'Clase 4.mp4 exceeds the limit' },
          { fileName: 'Clase 5.mp4', code: 'FILE_TOO_LARGE', message: 'Clase 5.mp4 exceeds the limit' }
        ]
      }
    })

    const { invalidateSpy } = renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar archivo' }))

    // Real counts from the mocked response (1 succeeded + 2 failed = 3 attempted), not hardcoded copy.
    expect(await screen.findByText('2 de 3 archivos no se agregaron')).toBeInTheDocument()
    expect(screen.getByText('Clase 4.mp4 supera el límite de 250 MB')).toBeInTheDocument()
    expect(screen.getByText('Clase 5.mp4 supera el límite de 250 MB')).toBeInTheDocument()

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled())
    for (const call of invalidateSpy.mock.calls) {
      expect(call[0]).toMatchObject({ queryKey: ['adjuntos', 42] })
    }
  })

  it('opening an attachment calls adjuntosApi.open and triggers no invalidation', async () => {
    window.api.adjuntos.open = vi.fn().mockResolvedValue({ ok: true, data: undefined })

    const { invalidateSpy } = renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))

    await waitFor(() => expect(window.api.adjuntos.open).toHaveBeenCalledWith(1))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('deleting an attachment invalidates ONLY the ["adjuntos", subjectId] query', async () => {
    window.api.adjuntos.remove = vi.fn().mockResolvedValue({ ok: true, data: { id: 1, fileRemoved: true } })

    const { invalidateSpy } = renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(window.api.adjuntos.remove).toHaveBeenCalledWith(1))
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled())
    for (const call of invalidateSpy.mock.calls) {
      expect(call[0]).toMatchObject({ queryKey: ['adjuntos', 42] })
    }
  })

  it('shows the "Archivo no encontrado" row state on ATTACHMENT_FILE_MISSING, and the row stays in the list', async () => {
    window.api.adjuntos.open = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'ATTACHMENT_FILE_MISSING', message: 'file is gone' } })

    renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))

    expect(await screen.findByText('No se encontró el archivo en disco')).toBeInTheDocument()
    // The row itself — file name and its Abrir/Eliminar actions — is still rendered, never auto-deleted.
    expect(screen.getByText('apuntes.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
  })

  it('shows a channel-level failure message when adjuntos:add rejects', async () => {
    // Regresses if `addMutation` still has no `onError` (current bug: the
    // channel-level failure is swallowed and nothing renders).
    window.api.adjuntos.add = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: 'subject is gone' } })

    renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar archivo' }))

    expect(await screen.findByText('No se pudo agregar el archivo')).toBeInTheDocument()
  })

  it('shows a channel-level failure message when adjuntos:delete rejects, and the row stays listed', async () => {
    // Regresses if `deleteMutation` still has no `onError` (current bug: the
    // failure vanishes and there is no feedback that the delete did not happen).
    window.api.adjuntos.remove = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'DELETE_FAILED', message: 'could not delete' } })

    renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    expect(await screen.findByText('No se pudo eliminar el adjunto')).toBeInTheDocument()
    // The row must still be there — nothing was actually removed.
    expect(screen.getByText('apuntes.pdf')).toBeInTheDocument()
  })

  it('shows a channel-level failure message when adjuntos:open rejects with a code other than ATTACHMENT_FILE_MISSING, and does not mark the row missing', async () => {
    // Regresses if `openMutation.onError` still only handles
    // `ATTACHMENT_FILE_MISSING` and silently drops every other code (e.g. `OPEN_FAILED`).
    window.api.adjuntos.open = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'OPEN_FAILED', message: 'could not open' } })

    renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))

    expect(await screen.findByText('No se pudo abrir el archivo')).toBeInTheDocument()
    expect(screen.queryByText('No se encontró el archivo en disco')).not.toBeInTheDocument()
  })

  it('ATTACHMENT_FILE_MISSING still shows only the per-row missing state, never the generic open failure message', async () => {
    // Regression guard: confirms the ATTACHMENT_FILE_MISSING branch keeps its
    // existing dedicated behavior and does NOT fall through to the new
    // generic banner once other open failures start being handled.
    window.api.adjuntos.open = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'ATTACHMENT_FILE_MISSING', message: 'file is gone' } })

    renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))

    expect(await screen.findByText('No se encontró el archivo en disco')).toBeInTheDocument()
    expect(screen.queryByText('No se pudo abrir el archivo')).not.toBeInTheDocument()
  })

  it('clears a channel-level failure message once a later action succeeds', async () => {
    // Regresses if the error message is never cleared on success (stale
    // error would linger over a working list forever).
    window.api.adjuntos.remove = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'DELETE_FAILED', message: 'could not delete' } })
      .mockResolvedValueOnce({ ok: true, data: { id: 1, fileRemoved: true } })

    renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('No se pudo eliminar el adjunto')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(screen.queryByText('No se pudo eliminar el adjunto')).not.toBeInTheDocument())
  })

  it('clicking "Sincronizar" invokes indexado:sync', async () => {
    renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar' }))

    await waitFor(() => expect(window.api.indexado.sync).toHaveBeenCalledTimes(1))
  })

  it('subscribes to indexado:status-changed and invalidates ONLY the ["adjuntos", subjectId] query when the payload matches this subject', async () => {
    let pushStatusChanged: ((payload: { subjectId: number }) => void) | undefined
    window.api.indexado.onStatusChanged = vi.fn().mockImplementation((callback) => {
      pushStatusChanged = callback
      return vi.fn()
    })

    const { invalidateSpy } = renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    expect(pushStatusChanged).toBeDefined()
    pushStatusChanged?.({ subjectId: 42 })

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled())
    for (const call of invalidateSpy.mock.calls) {
      expect(call[0]).toMatchObject({ queryKey: ['adjuntos', 42] })
    }
  })

  it('ignores an indexado:status-changed push for a DIFFERENT subject (not a hardcoded pass-through)', async () => {
    let pushStatusChanged: ((payload: { subjectId: number }) => void) | undefined
    window.api.indexado.onStatusChanged = vi.fn().mockImplementation((callback) => {
      pushStatusChanged = callback
      return vi.fn()
    })

    const { invalidateSpy } = renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    pushStatusChanged?.({ subjectId: 99 })

    // Give any (incorrect) async invalidation a chance to fire before asserting it never did.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('unsubscribes from indexado:status-changed on unmount', async () => {
    const unsubscribe = vi.fn()
    window.api.indexado.onStatusChanged = vi.fn().mockReturnValue(unsubscribe)

    const { unmount } = renderWithClient(<AdjuntosContainer subjectId={42} />)
    await screen.findByText('apuntes.pdf')

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
