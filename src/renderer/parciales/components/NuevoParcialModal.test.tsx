// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NuevoParcialModal } from './NuevoParcialModal'

describe('NuevoParcialModal', () => {
  it('renders the approved field set, its optional badges and its hints', () => {
    render(
      <NuevoParcialModal mode="create" subjectId={7} subjectName="Análisis" onSubmit={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getByRole('dialog', { name: 'Nuevo parcial' })).toBeInTheDocument()
    // Labels carry their own casing in the catalog — this repo's verified
    // convention for the `Label` primitive, never an `uppercase` CSS class.
    expect(screen.getByLabelText('NOMBRE DEL PARCIAL')).toBeInTheDocument()
    expect(screen.getByLabelText(/FECHA/)).toBeInTheDocument()
    expect(screen.getByLabelText(/NOTA/)).toBeInTheDocument()
    expect(screen.getByText('RESULTADO')).toBeInTheDocument()
    expect(screen.getAllByText('opcional')).toHaveLength(2)
    expect(screen.getByText('Dejala vacía si la cátedra todavía no la publicó.')).toBeInTheDocument()
    expect(screen.getByText('Aprobado sin nota es válido: dejala vacía.')).toBeInTheDocument()
  })

  // The point of the whole feature: recording a result must not be mistaken
  // for declaring the condición.
  it('states that the result does not decide the condición', () => {
    render(
      <NuevoParcialModal mode="create" subjectId={7} subjectName="Análisis" onSubmit={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getByText('El resultado no decide la condición: la regularidad la declarás vos.')).toBeInTheDocument()
    expect(screen.getByText('Podés cargar parciales y recuperatorios')).toBeInTheDocument()
  })

  it('submits a parcial with a date and a nota, with subjectId taken from context', async () => {
    const onSubmit = vi.fn()
    render(
      <NuevoParcialModal mode="create" subjectId={7} subjectName="Análisis" onSubmit={onSubmit} onClose={vi.fn()} />
    )

    fireEvent.change(screen.getByLabelText('NOMBRE DEL PARCIAL'), { target: { value: '1er parcial' } })
    fireEvent.change(screen.getByLabelText(/FECHA/), { target: { value: '2026-05-12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aprobado' }))
    fireEvent.change(screen.getByLabelText(/NOTA/), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar parcial' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      subjectId: 7,
      label: '1er parcial',
      takenOn: '2026-05-12',
      result: 'aprobado',
      grade: 8
    })
  })

  // Both optional fields left empty: a parcial the cátedra has not dated,
  // with no nota to record yet.
  it('submits a parcial with neither a date nor a nota', async () => {
    const onSubmit = vi.fn()
    render(
      <NuevoParcialModal mode="create" subjectId={7} subjectName="Análisis" onSubmit={onSubmit} onClose={vi.fn()} />
    )

    fireEvent.change(screen.getByLabelText('NOMBRE DEL PARCIAL'), { target: { value: 'Recuperatorio 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar parcial' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      subjectId: 7,
      label: 'Recuperatorio 1',
      takenOn: null,
      result: 'pendiente',
      grade: null
    })
  })

  it('does not submit without a name', async () => {
    const onSubmit = vi.fn()
    render(
      <NuevoParcialModal mode="create" subjectId={7} subjectName="Análisis" onSubmit={onSubmit} onClose={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Agregar parcial' }))

    await waitFor(() => expect(screen.getByText('Poné un nombre')).toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('marks the chosen result on the segmented control', () => {
    render(
      <NuevoParcialModal mode="create" subjectId={7} subjectName="Análisis" onSubmit={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getByRole('button', { name: 'Pendiente' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Reprobado' }))

    expect(screen.getByRole('button', { name: 'Reprobado' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Pendiente' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('edit mode: prefills the row, saves with the established copy and offers the delete', async () => {
    const onSubmit = vi.fn()
    const onDelete = vi.fn()
    render(
      <NuevoParcialModal
        mode="edit"
        subjectId={7}
        subjectName="Análisis"
        defaultValues={{ label: '1er parcial', takenOn: '2026-05-12', result: 'aprobado', grade: 8 }}
        onSubmit={onSubmit}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Editar parcial' })).toBeInTheDocument()
    expect(screen.getByLabelText('NOMBRE DEL PARCIAL')).toHaveValue('1er parcial')
    expect(screen.getByLabelText(/FECHA/)).toHaveValue('2026-05-12')
    expect(screen.getByLabelText(/NOTA/)).toHaveValue(8)
    expect(screen.getByRole('button', { name: 'Aprobado' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar parcial' }))
    expect(onDelete).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      subjectId: 7,
      label: '1er parcial',
      takenOn: '2026-05-12',
      result: 'aprobado',
      grade: 8
    })
  })

  it('create mode offers no delete — there is nothing recorded to remove', () => {
    render(
      <NuevoParcialModal mode="create" subjectId={7} subjectName="Análisis" onSubmit={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.queryByRole('button', { name: 'Eliminar parcial' })).not.toBeInTheDocument()
  })

  it('calls onClose when the cancel button is clicked', () => {
    const onClose = vi.fn()
    render(
      <NuevoParcialModal mode="create" subjectId={7} subjectName="Análisis" onSubmit={vi.fn()} onClose={onClose} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // The failure takes the footer-note slot, same as NuevaInstanciaModal: a
  // note about what you CAN do is noise while the form is telling you what
  // just did not happen.
  it('reports a failed write in the footer instead of the hint', () => {
    render(
      <NuevoParcialModal
        mode="create"
        subjectId={7}
        subjectName="Análisis"
        error="No pudimos guardar el parcial."
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('No pudimos guardar el parcial.')).toBeInTheDocument()
    expect(screen.queryByText('Podés cargar parciales y recuperatorios')).not.toBeInTheDocument()
  })
})
