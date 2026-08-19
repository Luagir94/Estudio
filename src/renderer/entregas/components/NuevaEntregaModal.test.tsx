// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NuevaEntregaModal } from './NuevaEntregaModal'

// Amendment 8: the subject is known from context (the subject detail screen
// the user launched creation from, or the deadline being edited) — it is
// fixed via the `subjectId` prop and never rendered as a choosable field.
// Design node `HE9Wn`/`efbfH` (verified via the Pencil MCP tools, 2026-08-15):
// the modal body is TÍTULO, then a row of TIPO + FECHA LÍMITE only — no
// MATERIA select.
describe('NuevaEntregaModal (design node HE9Wn — reused for create AND edit, spec: "Editing MUST reuse the \'Nueva entrega\' form")', () => {
  it('create mode: submits título/tipo/fecha límite, with subjectId taken from context, not chosen by the user', async () => {
    const onSubmit = vi.fn()
    render(<NuevaEntregaModal mode="create" subjectId={1} onSubmit={onSubmit} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Nueva entrega' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'TP 2 — Scheduler' } })
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'Trabajo práctico' } })
    fireEvent.change(screen.getByLabelText('Fecha límite'), { target: { value: '2027-08-18T23:59' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar entrega' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      title: 'TP 2 — Scheduler',
      subjectId: 1,
      type: 'Trabajo práctico',
      dueAt: '2027-08-18T23:59'
    })
  })

  it('does not render a Materia field or label anywhere (spec: "materia MUST NOT be a field the user selects on the creation form")', () => {
    render(<NuevaEntregaModal mode="create" subjectId={1} onSubmit={vi.fn()} onClose={vi.fn()} />)

    expect(screen.queryByLabelText('Materia')).not.toBeInTheDocument()
    expect(screen.queryByText('Materia')).not.toBeInTheDocument()
  })

  it('does not submit when required fields are missing', async () => {
    const onSubmit = vi.fn()
    render(<NuevaEntregaModal mode="create" subjectId={1} onSubmit={onSubmit} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Agregar entrega' }))

    await waitFor(() => expect(screen.getByText('title is required')).toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('edit mode: title is "Editar entrega", submit label is "Guardar cambios", fields are prefilled, and subjectId stays fixed to the deadline\'s existing subject', async () => {
    const onSubmit = vi.fn()
    render(
      <NuevaEntregaModal
        mode="edit"
        subjectId={2}
        defaultValues={{ title: 'TP 2 — Scheduler', type: 'Trabajo práctico', dueAt: '2027-08-18T23:59' }}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Editar entrega' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    expect(screen.getByLabelText('Título')).toHaveValue('TP 2 — Scheduler')
    expect(screen.getByLabelText('Fecha límite')).toHaveValue('2027-08-18T23:59')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ subjectId: 2 })
  })

  it('calls onClose when the cancel button is clicked', () => {
    const onClose = vi.fn()
    render(<NuevaEntregaModal mode="create" subjectId={1} onSubmit={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
