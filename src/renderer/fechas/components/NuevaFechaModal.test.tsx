// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AcademicDateRecord } from '../../../shared/ipc/fechas'
import { NuevaFechaModal } from './NuevaFechaModal'

const existingDate: AcademicDateRecord = {
  id: 4,
  programId: 2,
  title: 'Inscripción a finales — Diciembre',
  kind: 'inscripcionFinales',
  startsOn: '2026-12-01',
  endsOn: '2026-12-05'
}

describe('NuevaFechaModal (approved design: "Nueva fecha administrativa")', () => {
  it('offers the four kinds with their Spanish labels', () => {
    render(<NuevaFechaModal programId={2} programName="Abogacía" onSubmit={vi.fn()} onClose={vi.fn()} />)

    const kind = screen.getByLabelText('Tipo')

    expect(Array.from(kind.querySelectorAll('option')).map((option) => option.textContent)).toEqual([
      'Inscripción a finales',
      'Inscripción a cursadas',
      'Vencimiento de regularidad',
      'Otro'
    ])
  })

  it('teaches that the tipo only classifies', () => {
    render(<NuevaFechaModal programId={2} programName="Abogacía" onSubmit={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText(/Clasifica la fecha/)).toBeInTheDocument()
    expect(screen.getByText(/Sin fecha de fin, es de un solo día/)).toBeInTheDocument()
  })

  it('submits the filled window, carrying the programId it was opened for', async () => {
    const onSubmit = vi.fn()
    render(<NuevaFechaModal programId={2} programName="Abogacía" onSubmit={onSubmit} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Título'), 'Inscripción a finales — Diciembre')
    await userEvent.type(screen.getByLabelText('Desde'), '2026-12-01')
    await userEvent.type(screen.getByLabelText('Hasta (opcional)'), '2026-12-05')
    await userEvent.click(screen.getByRole('button', { name: 'Crear fecha' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        programId: 2,
        title: 'Inscripción a finales — Diciembre',
        kind: 'inscripcionFinales',
        startsOn: '2026-12-01',
        endsOn: '2026-12-05'
      })
    )
  })

  it('submits a single-day date when HASTA is left blank', async () => {
    const onSubmit = vi.fn()
    render(<NuevaFechaModal programId={2} programName="Abogacía" onSubmit={onSubmit} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Título'), 'Vencimiento de regularidad')
    await userEvent.type(screen.getByLabelText('Desde'), '2026-12-20')
    await userEvent.click(screen.getByRole('button', { name: 'Crear fecha' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ endsOn: null })))
  })

  it('refuses a window that ends before it starts, in the app own words', async () => {
    const onSubmit = vi.fn()
    render(<NuevaFechaModal programId={2} programName="Abogacía" onSubmit={onSubmit} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Título'), 'Inscripción')
    await userEvent.type(screen.getByLabelText('Desde'), '2026-12-05')
    await userEvent.type(screen.getByLabelText('Hasta (opcional)'), '2026-12-01')
    await userEvent.click(screen.getByRole('button', { name: 'Crear fecha' }))

    expect(await screen.findByText('La fecha de fin no puede ser anterior a la de inicio')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses an empty title with the app own copy, not a machine key', async () => {
    render(<NuevaFechaModal programId={2} programName="Abogacía" onSubmit={vi.fn()} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Desde'), '2026-12-01')
    await userEvent.click(screen.getByRole('button', { name: 'Crear fecha' }))

    expect(await screen.findByText('Poné un título')).toBeInTheDocument()
  })

  describe('edit mode', () => {
    it('opens prefilled with the stored date and saves instead of creating', async () => {
      const onSubmit = vi.fn()
      render(
        <NuevaFechaModal
          programId={2}
          programName="Abogacía"
          academicDate={existingDate}
          onSubmit={onSubmit}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByLabelText('Título')).toHaveValue('Inscripción a finales — Diciembre')
      expect(screen.getByLabelText('Desde')).toHaveValue('2026-12-01')
      expect(screen.getByLabelText('Hasta (opcional)')).toHaveValue('2026-12-05')

      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      // The form always speaks the CREATION contract (same rule as
      // NuevoPeriodoModal) — the container is what turns it into an update.
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          programId: 2,
          title: 'Inscripción a finales — Diciembre',
          kind: 'inscripcionFinales',
          startsOn: '2026-12-01',
          endsOn: '2026-12-05'
        })
      )
    })

    // Same one-entry-point rule as EditarCarreraModal/EditarMateriaModal: the
    // row has no delete affordance of its own, so the form that edits it is
    // also where it is destroyed.
    it('offers the delete only while editing', async () => {
      const onDelete = vi.fn()
      const { rerender } = render(
        <NuevaFechaModal
          programId={2}
          programName="Abogacía"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
          onDelete={onDelete}
        />
      )

      expect(screen.queryByRole('button', { name: 'Eliminar fecha' })).not.toBeInTheDocument()

      rerender(
        <NuevaFechaModal
          programId={2}
          programName="Abogacía"
          academicDate={existingDate}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
          onDelete={onDelete}
        />
      )
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar fecha' }))

      expect(onDelete).toHaveBeenCalledTimes(1)
    })
  })

  it('reports why the last submit did not go through, in app-owned copy', () => {
    render(
      <NuevaFechaModal
        programId={2}
        programName="Abogacía"
        error="No se pudo completar la creación. Probá de nuevo."
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('No se pudo completar la creación. Probá de nuevo.')).toBeInTheDocument()
  })
})
