// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectDetailResult } from '../../../shared/ipc/materias'
import { appApi } from '../../shared/adapters/appApi'
import { entregasApi } from '../../entregas/adapters/entregasApi'
import { materiasApi } from '../adapters/materiasApi'
import { SubjectDetailContainer } from './SubjectDetailContainer'

vi.mock('../adapters/materiasApi', () => ({
  materiasApi: { detail: vi.fn(), updateSchedule: vi.fn(), delete: vi.fn(), setOutcome: vi.fn() }
}))

vi.mock('../../shared/adapters/appApi', () => ({
  appApi: { openExternal: vi.fn() }
}))

vi.mock('../../entregas/adapters/entregasApi', () => ({
  entregasApi: { create: vi.fn() }
}))

vi.mock('../../entregas/components/NuevaEntregaModal', () => ({
  NuevaEntregaModal: ({
    mode,
    subjectId,
    onSubmit,
    onClose
  }: {
    mode: string
    subjectId: number
    onSubmit: (input: unknown) => void
    onClose: () => void
  }) => (
    <div role="dialog" aria-label="Nueva entrega">
      <span>
        stub-entrega-modal-{mode}-{subjectId}
      </span>
      <button
        type="button"
        onClick={() => onSubmit({ title: 'Stub', type: 'Trabajo práctico', dueAt: '2027-08-18T23:59', subjectId })}
      >
        stub-entrega-submit
      </button>
      <button type="button" onClick={onClose}>
        stub-entrega-close
      </button>
    </div>
  )
}))

vi.mock('../components/EditarMateriaModal', () => ({
  EditarMateriaModal: ({
    onSubmit,
    onClose,
    onDelete
  }: {
    onSubmit: (input: unknown) => void
    onClose: () => void
    onDelete?: () => void
  }) => (
    <div role="dialog" aria-label="Editar materia">
      <button type="button" onClick={() => onSubmit({ id: 1, name: 'Stub', code: 'STUB', color: '#000', slots: [] })}>
        stub-edit-submit
      </button>
      <button type="button" onClick={onClose}>
        stub-edit-close
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete}>
          Eliminar materia
        </button>
      )}
    </div>
  )
}))

vi.mock('../../adjuntos/containers/AdjuntosContainer', () => ({
  AdjuntosContainer: ({
    subjectId,
    onOpenMarkdown
  }: {
    subjectId: number
    onOpenMarkdown?: (attachment: unknown) => void
  }) => (
    <div>
      stub-adjuntos-{subjectId}
      {onOpenMarkdown && (
        <button
          type="button"
          onClick={() =>
            onOpenMarkdown({
              id: 9,
              subjectId,
              fileName: 'Resumen unidad 3.md',
              mimeType: null,
              sizeBytes: 8397,
              title: null,
              createdAt: '2026-08-18T10:00',
              indexStatus: 'indexed',
              origin: 'user'
            })
          }
        >
          stub-open-markdown
        </button>
      )}
    </div>
  )
}))

vi.mock('../../adjuntos/containers/AttachmentViewerContainer', () => ({
  AttachmentViewerContainer: ({
    attachment,
    subjectId,
    subjectName,
    onBack
  }: {
    attachment: { fileName: string }
    subjectId: number
    subjectName: string
    onBack: () => void
  }) => (
    <div>
      <span>
        stub-viewer-{attachment.fileName}-{subjectName}-{subjectId}
      </span>
      <button type="button" onClick={onBack}>
        stub-viewer-back
      </button>
    </div>
  )
}))

vi.mock('../components/DeleteSubjectConfirmDialog', () => ({
  DeleteSubjectConfirmDialog: ({
    deadlineCount,
    onConfirm,
    onCancel
  }: {
    deadlineCount: number
    onConfirm: () => void
    onCancel: () => void
  }) => (
    <div role="dialog" aria-label="Eliminar materia">
      <p>{deadlineCount} entregas</p>
      <button type="button" onClick={onConfirm}>
        stub-delete-confirm
      </button>
      <button type="button" onClick={onCancel}>
        stub-delete-cancel
      </button>
    </div>
  )
}))

const sampleDetail: SubjectDetailResult = {
  id: 1,
  name: 'Algoritmos',
  code: 'ALG-101',
  color: '#7c3aed',
  docente: null,
  contacto: null,
  comision: null,
  aula: null,
  campusUrl: 'https://campus.uni.edu/course/1',
  groupUrl: null,
  notas: null,
  attendanceMinPercent: null,
  periodId: null,
  outcome: null,
  grade: null,
  regularity: null,
  slots: [{ id: 1, subjectId: 1, dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: null }],
  deadlines: [
    { id: 1, subjectId: 1, title: 'TP1', type: 'tp', dueAt: '2026-04-01T23:59', done: true },
    { id: 2, subjectId: 1, title: 'TP2', type: 'tp', dueAt: '2026-04-08T23:59', done: false }
  ],
  period: null,
  program: null,
  finals: [],
  parciales: []
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('SubjectDetailContainer', () => {
  beforeEach(() => {
    // Clear call history (not implementations) between tests — needed now
    // that a new test asserts entregasApi.create was NOT called, which
    // would otherwise see call counts leak in from an earlier test in this
    // file (mocks are module-scoped, not per-test, in vitest).
    vi.clearAllMocks()
    vi.mocked(materiasApi.detail).mockResolvedValue(sampleDetail)
    vi.mocked(materiasApi.updateSchedule).mockResolvedValue({ ...sampleDetail })
    vi.mocked(materiasApi.delete).mockResolvedValue({ deletedSlots: 1, deletedDeadlines: 2 })
    vi.mocked(materiasApi.setOutcome).mockResolvedValue({
      ...sampleDetail,
      outcome: 'aprobada',
      grade: 7,
      finals: [],
      pendingDeadlines: 0
    })
    vi.mocked(appApi.openExternal).mockResolvedValue(undefined)
    vi.mocked(entregasApi.create).mockResolvedValue({
      id: 3,
      subjectId: 1,
      title: 'Stub',
      type: 'Trabajo práctico',
      dueAt: '2027-08-18T23:59',
      done: false,
      subjectName: 'Algoritmos',
      subjectColor: '#7c3aed'
    })
  })

  it('fetches on the ["materias","detail",id] query key and renders the computed progreso', async () => {
    renderWithClient(<SubjectDetailContainer subjectId={1} onBack={vi.fn()} now={new Date('2026-03-04T09:00:00')} />)

    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
    expect(materiasApi.detail).toHaveBeenCalledWith(1)
  })

  it('mounts AdjuntosContainer fixed to this subject (amendment: the ADJUNTOS section renders inside Subject Detail, same cross-slice precedent as FinalesContainer)', async () => {
    renderWithClient(<SubjectDetailContainer subjectId={1} onBack={vi.fn()} now={new Date('2026-03-04T09:00:00')} />)
    await screen.findByText('1 de 2')

    expect(screen.getByText('stub-adjuntos-1')).toBeInTheDocument()
  })

  it('the "Materias" back link calls onBack (design: back link reads "Materias", not "Volver")', async () => {
    const onBack = vi.fn()
    renderWithClient(<SubjectDetailContainer subjectId={1} onBack={onBack} now={new Date('2026-03-04T09:00:00')} />)
    await screen.findByText('1 de 2')

    fireEvent.click(screen.getByRole('button', { name: 'Materias' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('opens the Editar materia modal and submitting calls materiasApi.updateSchedule', async () => {
    renderWithClient(<SubjectDetailContainer subjectId={1} onBack={vi.fn()} now={new Date('2026-03-04T09:00:00')} />)
    await screen.findByText('1 de 2')

    // The header's "Editar materia" button is the only edit entry point on
    // this screen (the NOTAS section's duplicate was removed by the approved
    // compaction — see SubjectDetail.test.tsx).
    fireEvent.click(screen.getByRole('button', { name: 'Editar materia' }))
    fireEvent.click(screen.getByText('stub-edit-submit'))

    await waitFor(() => expect(materiasApi.updateSchedule).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar materia' })).not.toBeInTheDocument())
  })

  it('opens the delete confirmation (via the Editar materia modal footer, design node hjivW/INZOe) stating the fetched deadline count, and confirming deletes + calls onBack', async () => {
    const onBack = vi.fn()
    renderWithClient(<SubjectDetailContainer subjectId={1} onBack={onBack} now={new Date('2026-03-04T09:00:00')} />)
    await screen.findByText('1 de 2')

    // Design puts "Eliminar materia" in the Editar materia modal's footer,
    // not as a standalone button on the detail screen — open the modal
    // first via the header's "Editar materia" button (the screen's only
    // edit entry point).
    fireEvent.click(screen.getByRole('button', { name: 'Editar materia' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar materia' }))
    expect(screen.getByText('2 entregas')).toBeInTheDocument()

    fireEvent.click(screen.getByText('stub-delete-confirm'))

    await waitFor(() => expect(materiasApi.delete).toHaveBeenCalledWith(1))
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1))
  })

  it('clicking the campus link calls appApi.openExternal with the stored campusUrl', async () => {
    renderWithClient(<SubjectDetailContainer subjectId={1} onBack={vi.fn()} now={new Date('2026-03-04T09:00:00')} />)
    await screen.findByText('1 de 2')

    fireEvent.click(screen.getByRole('button', { name: /campus/i }))

    expect(appApi.openExternal).toHaveBeenCalledWith('https://campus.uni.edu/course/1')
  })

  it('opens the "Nueva entrega" modal, fixed to this subject, when "Agregar entrega" is clicked (amendment 8 — the only creation entry point)', async () => {
    renderWithClient(<SubjectDetailContainer subjectId={1} onBack={vi.fn()} now={new Date('2026-03-04T09:00:00')} />)
    await screen.findByText('1 de 2')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar entrega' }))

    expect(screen.getByText('stub-entrega-modal-create-1')).toBeInTheDocument()
  })

  it('submitting the "Nueva entrega" modal calls entregasApi.create and closes the modal', async () => {
    renderWithClient(<SubjectDetailContainer subjectId={1} onBack={vi.fn()} now={new Date('2026-03-04T09:00:00')} />)
    await screen.findByText('1 de 2')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar entrega' }))
    fireEvent.click(screen.getByText('stub-entrega-submit'))

    await waitFor(() => expect(entregasApi.create).toHaveBeenCalledTimes(1))
    expect(vi.mocked(entregasApi.create).mock.calls[0]?.[0]).toMatchObject({ subjectId: 1 })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nueva entrega' })).not.toBeInTheDocument())
  })

  it('closing the "Nueva entrega" modal without submitting calls no mutation', async () => {
    renderWithClient(<SubjectDetailContainer subjectId={1} onBack={vi.fn()} now={new Date('2026-03-04T09:00:00')} />)
    await screen.findByText('1 de 2')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar entrega' }))
    fireEvent.click(screen.getByText('stub-entrega-close'))

    expect(screen.queryByRole('dialog', { name: 'Nueva entrega' })).not.toBeInTheDocument()
    expect(entregasApi.create).not.toHaveBeenCalled()
  })

  // Closing a subject lives HERE and nowhere else. The Materias list used to
  // own it behind a banner gated on the período having ENDED — `sampleDetail`
  // has no período at all, and the action must still be reachable.
  describe('cerrar materia', () => {
    const numericProgram = { id: 1, name: 'Abogacía', gradingScheme: 'numerico' as const, gradeScale: 10 }

    async function openCloseForm(detail: SubjectDetailResult = sampleDetail) {
      vi.mocked(materiasApi.detail).mockResolvedValue(detail)
      renderWithClient(<SubjectDetailContainer subjectId={1} onBack={vi.fn()} now={new Date('2026-03-04T09:00:00')} />)
      await screen.findByText('1 de 2')
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar materia' }))
    }

    it('opens the form from the header even when the subject has no período', async () => {
      await openCloseForm()

      expect(screen.getByRole('dialog', { name: 'Cerrar materia' })).toBeInTheDocument()
    })

    it('records "aprobada" with its grade and closes the form', async () => {
      await openCloseForm({ ...sampleDetail, program: numericProgram })

      // Nothing is pre-selected on an undecided subject — the outcome is an
      // explicit click, and only then does the nota field appear.
      fireEvent.click(screen.getByRole('button', { name: /Aprobada/ }))
      fireEvent.change(screen.getByLabelText(/NOTA/), { target: { value: '7' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => {
        expect(vi.mocked(materiasApi.setOutcome).mock.calls[0]?.[0]).toEqual({ id: 1, outcome: 'aprobada', grade: 7 })
      })
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cerrar materia' })).not.toBeInTheDocument())
    })

    it('sends no grade when the subject is left with a pending final', async () => {
      await openCloseForm({ ...sampleDetail, program: numericProgram })

      fireEvent.click(screen.getByRole('button', { name: /Final pendiente/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => {
        expect(vi.mocked(materiasApi.setOutcome).mock.calls[0]?.[0]).toEqual({
          id: 1,
          outcome: 'finalPendiente',
          grade: null
        })
      })
    })

    // An aplazo has a number too, and `calculateProgramAverage` already
    // reports "con aplazos" separately from "sin aplazos" — that split was
    // unreachable while the form only offered a grade on `aprobada`.
    it('offers the grade on a reprobada too and sends it', async () => {
      await openCloseForm({ ...sampleDetail, program: numericProgram })

      fireEvent.click(screen.getByRole('button', { name: /Reprobada/ }))
      fireEvent.change(screen.getByLabelText(/NOTA/), { target: { value: '3' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => {
        expect(vi.mocked(materiasApi.setOutcome).mock.calls[0]?.[0]).toEqual({ id: 1, outcome: 'reprobada', grade: 3 })
      })
    })

    it('leaves the grade optional on a reprobada', async () => {
      await openCloseForm({ ...sampleDetail, program: numericProgram })

      fireEvent.click(screen.getByRole('button', { name: /Reprobada/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => {
        expect(vi.mocked(materiasApi.setOutcome).mock.calls[0]?.[0]).toEqual({
          id: 1,
          outcome: 'reprobada',
          grade: null
        })
      })
    })

    it('still asks for no grade when the final is pending — there is no result yet', async () => {
      await openCloseForm({ ...sampleDetail, program: numericProgram })

      fireEvent.click(screen.getByRole('button', { name: /Final pendiente/ }))

      expect(screen.queryByLabelText(/NOTA/)).not.toBeInTheDocument()
    })

    it('refuses a grade above the program scale', async () => {
      await openCloseForm({ ...sampleDetail, program: numericProgram })

      fireEvent.click(screen.getByRole('button', { name: /Aprobada/ }))
      fireEvent.change(screen.getByLabelText(/NOTA/), { target: { value: '11' } })

      expect(await screen.findByText('La nota tiene que ser un número entre 0 y 10.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(materiasApi.setOutcome).not.toHaveBeenCalled()
    })

    it('asks for no grade under a pass/fail program', async () => {
      await openCloseForm({
        ...sampleDetail,
        program: { id: 2, name: 'Curso de Bartender', gradingScheme: 'binario', gradeScale: null }
      })

      // The note area holds ONE message: until an outcome is picked it shows
      // the choose-first prompt, so the no-grade explainer needs a selection.
      fireEvent.click(screen.getByRole('button', { name: /Aprobada/ }))

      expect(screen.queryByLabelText(/NOTA/)).not.toBeInTheDocument()
      expect(screen.getByText(/no lleva nota/)).toBeInTheDocument()
    })

    // The reopen flow rides the SAME form and the SAME mutation: "Reabrir"
    // submits outcome null, and the repository clears outcome and grade.
    it('reopens a decided subject — Reabrir submits outcome null and grade null', async () => {
      await openCloseForm({ ...sampleDetail, program: numericProgram, outcome: 'aprobada', grade: 7 })

      fireEvent.click(screen.getByRole('button', { name: /Reabrir/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => {
        expect(vi.mocked(materiasApi.setOutcome).mock.calls[0]?.[0]).toEqual({ id: 1, outcome: null, grade: null })
      })
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cerrar materia' })).not.toBeInTheDocument())
    })
  })

  // markdown-attachment-viewer — opening a .md attachment renders the
  // full-screen viewer INSTEAD of the detail screen (the exact
  // MateriasContainer selectedSubjectId pattern), and its back link returns
  // to the detail.
  describe('markdown viewer routing', () => {
    it('replaces the detail screen with the viewer when a .md attachment is opened', async () => {
      renderWithClient(<SubjectDetailContainer subjectId={1} onBack={vi.fn()} now={new Date('2026-03-04T09:00:00')} />)
      await screen.findByText('1 de 2')

      fireEvent.click(screen.getByText('stub-open-markdown'))

      expect(screen.getByText('stub-viewer-Resumen unidad 3.md-Algoritmos-1')).toBeInTheDocument()
      expect(screen.queryByText('1 de 2')).not.toBeInTheDocument()
    })

    it('the viewer back link returns to the detail screen', async () => {
      renderWithClient(<SubjectDetailContainer subjectId={1} onBack={vi.fn()} now={new Date('2026-03-04T09:00:00')} />)
      await screen.findByText('1 de 2')

      fireEvent.click(screen.getByText('stub-open-markdown'))
      fireEvent.click(screen.getByText('stub-viewer-back'))

      expect(await screen.findByText('1 de 2')).toBeInTheDocument()
      expect(screen.queryByText('stub-viewer-Resumen unidad 3.md-Algoritmos-1')).not.toBeInTheDocument()
    })
  })
})
