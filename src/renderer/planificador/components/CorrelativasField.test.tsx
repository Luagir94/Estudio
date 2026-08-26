// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SubjectPrerequisite } from '../../../shared/ipc/materias'
import { CorrelativasField } from './CorrelativasField'

function prerequisite(overrides: Partial<SubjectPrerequisite> & { id: number }): SubjectPrerequisite {
  return {
    subjectId: 9,
    requiredLevel: 'aprobada',
    ...overrides,
    requires: { id: 1, name: 'Álgebra I', outcome: null, regularity: null, finals: [], ...overrides.requires }
  }
}

function renderField(overrides: Partial<Parameters<typeof CorrelativasField>[0]> = {}) {
  const handlers = { onAdd: vi.fn(), onChangeLevel: vi.fn(), onRemove: vi.fn() }
  render(
    <CorrelativasField
      prerequisites={[]}
      candidates={[{ id: 2, name: 'Análisis Matemático I' }]}
      {...handlers}
      {...overrides}
    />
  )
  return handlers
}

describe('CorrelativasField', () => {
  it('labels the group', () => {
    renderField()

    expect(screen.getByRole('group', { name: 'CORRELATIVAS' })).toBeInTheDocument()
  })

  // A11y: a `<button>` IS labelable, so wrapping this group of controls in the
  // shared `<Label>` primitive would hijack the first button's accessible name
  // and leave it announced as "CORRELATIVAS". The REGULARIDAD field beside it
  // already uses fieldset/legend for exactly this reason.
  it('leaves each control with its own accessible name', () => {
    renderField({ prerequisites: [prerequisite({ id: 5 })] })

    expect(screen.getByRole('button', { name: 'Quitar Álgebra I de las correlativas' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Nivel de Álgebra I' })).toBeInTheDocument()
  })

  it('says so when the materia has no correlativas yet', () => {
    renderField()

    expect(screen.getByText('Todavía no cargaste correlativas.')).toBeInTheDocument()
  })

  it('shows the stored level of each correlativa', () => {
    renderField({
      prerequisites: [
        prerequisite({ id: 5, requiredLevel: 'regularizada' }),
        prerequisite({
          id: 6,
          requiredLevel: 'aprobada',
          requires: { id: 2, name: 'Análisis Matemático I', outcome: null, regularity: null, finals: [] }
        })
      ]
    })

    expect(screen.getByRole('combobox', { name: 'Nivel de Álgebra I' })).toHaveValue('regularizada')
    expect(screen.getByRole('combobox', { name: 'Nivel de Análisis Matemático I' })).toHaveValue('aprobada')
  })

  it('reports a level change', () => {
    const handlers = renderField({ prerequisites: [prerequisite({ id: 5 })] })

    fireEvent.change(screen.getByRole('combobox', { name: 'Nivel de Álgebra I' }), {
      target: { value: 'regularizada' }
    })

    expect(handlers.onChangeLevel).toHaveBeenCalledWith({ id: 5, requiredLevel: 'regularizada' })
  })

  it('reports a removal by the row id', () => {
    const handlers = renderField({ prerequisites: [prerequisite({ id: 5 })] })

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Álgebra I de las correlativas' }))

    expect(handlers.onRemove).toHaveBeenCalledWith(5)
  })

  describe('adding one', () => {
    it('keeps the picker closed until asked', () => {
      renderField()

      expect(screen.queryByRole('combobox', { name: 'Materia correlativa' })).not.toBeInTheDocument()
    })

    it('offers only the materias handed to it as candidates', () => {
      renderField({
        candidates: [
          { id: 2, name: 'Análisis Matemático I' },
          { id: 3, name: 'Física I' }
        ]
      })

      fireEvent.click(screen.getByRole('button', { name: 'Agregar correlativa' }))

      const picker = screen.getByRole('combobox', { name: 'Materia correlativa' })

      expect(within(picker).queryByText('Álgebra I')).not.toBeInTheDocument()
      expect(within(picker).getByText('Análisis Matemático I')).toBeInTheDocument()
      expect(within(picker).getByText('Física I')).toBeInTheDocument()
    })

    it('reports the chosen materia and level', () => {
      const handlers = renderField()

      fireEvent.click(screen.getByRole('button', { name: 'Agregar correlativa' }))
      fireEvent.change(screen.getByRole('combobox', { name: 'Materia correlativa' }), { target: { value: '2' } })
      fireEvent.change(screen.getByRole('combobox', { name: 'Nivel requerido' }), {
        target: { value: 'regularizada' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

      expect(handlers.onAdd).toHaveBeenCalledWith({ requiresSubjectId: 2, requiredLevel: 'regularizada' })
    })

    it('refuses to submit before a materia is chosen', () => {
      const handlers = renderField()

      fireEvent.click(screen.getByRole('button', { name: 'Agregar correlativa' }))
      fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

      expect(handlers.onAdd).not.toHaveBeenCalled()
    })

    it('closes the picker once the correlativa is added', () => {
      renderField()

      fireEvent.click(screen.getByRole('button', { name: 'Agregar correlativa' }))
      fireEvent.change(screen.getByRole('combobox', { name: 'Materia correlativa' }), { target: { value: '2' } })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

      expect(screen.queryByRole('combobox', { name: 'Materia correlativa' })).not.toBeInTheDocument()
    })

    // The picker excludes the materia itself and anything that would close a
    // cycle, so it can legitimately run out of options — and then the action
    // must say so instead of opening an empty dropdown.
    it('explains itself when there is nothing left to require', () => {
      renderField({ candidates: [] })

      expect(screen.getByText(/No queda ninguna materia/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Agregar correlativa' })).not.toBeInTheDocument()
    })
  })

  it('explains what correlativas are for, in two voices', () => {
    renderField()

    expect(screen.getByText('Definen si podés cursarla.')).toBeInTheDocument()
    expect(screen.getByText(/El planificador las usa para habilitar o bloquear la materia/)).toBeInTheDocument()
  })
})
