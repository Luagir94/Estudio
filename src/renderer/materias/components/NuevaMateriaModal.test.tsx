// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import { NuevaMateriaModal } from './NuevaMateriaModal'

// A subject is always created inside a period, so the form is only usable
// when at least one exists.
const programs: ProgramWithPeriods[] = [
  {
    id: 1,
    name: 'Abogacía',
    institution: null,
    color: '#4C8DFF',
    gradingScheme: 'numerico',
    gradeScale: 10,
    periods: [
      {
        id: 7,
        programId: 1,
        name: '1er Cuatrimestre 2026',
        kind: 'cuatrimestre',
        startsOn: '2026-03-09',
        endsOn: '2026-07-18'
      }
    ],
    subjectCount: 0,
    gradedSubjects: []
  }
]

describe('NuevaMateriaModal', () => {
  it('submits successfully with only the required fields plus one schedule slot', async () => {
    const onSubmit = vi.fn()
    render(
      <NuevaMateriaModal
        programs={programs}
        defaultPeriodId={7}
        onSubmit={onSubmit}
        onClose={vi.fn()}
        onGoToCarreras={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('NOMBRE'), { target: { value: 'Algoritmos' } })
    fireEvent.change(screen.getByLabelText('CÓDIGO'), { target: { value: 'ALG-101' } })
    fireEvent.click(screen.getByRole('button', { name: 'Color #22D3EE' }))
    // docente/contacto left blank on purpose (spec: "Create subject with
    // only required fields")
    fireEvent.click(screen.getByRole('button', { name: 'Agregar horario' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear materia' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const [submitted] = onSubmit.mock.calls[0] as [Record<string, unknown>]
    expect(submitted).toMatchObject({ name: 'Algoritmos', code: 'ALG-101', color: '#22D3EE' })
    expect(submitted.slots).toHaveLength(1)
  })

  it('does not submit when name is missing and a slot is missing', async () => {
    const onSubmit = vi.fn()
    render(
      <NuevaMateriaModal
        programs={programs}
        defaultPeriodId={7}
        onSubmit={onSubmit}
        onClose={vi.fn()}
        onGoToCarreras={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('CÓDIGO'), { target: { value: 'ALG-101' } })
    fireEvent.click(screen.getByRole('button', { name: 'Color #22D3EE' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear materia' }))

    await waitFor(() => expect(screen.getByText('Poné un nombre')).toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // The message was always on screen; what was missing was any link between it
  // and the field it judges. Without one a screen reader reads "NOMBRE, cuadro
  // de edición" on a field that was just rejected, and the rejection is a loose
  // paragraph further down.
  it('ties a rejection to the field it is about', async () => {
    render(
      <NuevaMateriaModal
        programs={programs}
        defaultPeriodId={7}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        onGoToCarreras={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Crear materia' }))

    await waitFor(() => {
      const name = screen.getByLabelText('NOMBRE')
      expect(name).toHaveAttribute('aria-invalid', 'true')
      expect(name).toHaveAccessibleDescription('Poné un nombre')
    })
    // A field the form did not reject stays unmarked.
    expect(screen.getByLabelText('DOCENTE')).not.toHaveAttribute('aria-invalid')
  })

  // None of these fields hold the USER. Docente and contacto describe a
  // teacher, so autofill offering the student's own name or address there is
  // wrong every single time it fires. Código is an identifier ("ALG-101"),
  // which the spellchecker underlines and has nothing to suggest for.
  it('keeps autofill off the fields that are about someone else', () => {
    render(
      <NuevaMateriaModal
        programs={programs}
        defaultPeriodId={7}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        onGoToCarreras={vi.fn()}
      />
    )

    for (const label of ['DOCENTE', 'CONTACTO', 'CÓDIGO']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'off')
    }
    expect(screen.getByLabelText('CÓDIGO')).toHaveAttribute('spellcheck', 'false')
    // The subject's own name IS prose the student wrote — it keeps its
    // spellchecker.
    expect(screen.getByLabelText('NOMBRE')).not.toHaveAttribute('spellcheck', 'false')
  })

  // Escape used to throw a filled-in form away on one stray key, with no undo
  // and nothing written anywhere.
  describe('unsaved changes', () => {
    function renderForm(onClose: () => void) {
      return render(
        <NuevaMateriaModal
          programs={programs}
          defaultPeriodId={7}
          onSubmit={vi.fn()}
          onClose={onClose}
          onGoToCarreras={vi.fn()}
        />
      )
    }

    it('asks before throwing away what was typed', () => {
      const onClose = vi.fn()
      renderForm(onClose)
      fireEvent.change(screen.getByLabelText('NOMBRE'), { target: { value: 'Algoritmos' } })

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog', { name: 'Descartar cambios' })).toBeInTheDocument()
      // The form is still mounted behind the question — that is what makes
      // "Seguir editando" able to give the typing back.
      expect(screen.getByLabelText('NOMBRE')).toHaveValue('Algoritmos')
    })

    it('gives the typing back on "Seguir editando"', () => {
      const onClose = vi.fn()
      renderForm(onClose)
      fireEvent.change(screen.getByLabelText('NOMBRE'), { target: { value: 'Algoritmos' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))

      expect(onClose).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog', { name: 'Descartar cambios' })).not.toBeInTheDocument()
      expect(screen.getByLabelText('NOMBRE')).toHaveValue('Algoritmos')
    })

    it('closes on "Descartar cambios"', () => {
      const onClose = vi.fn()
      renderForm(onClose)
      fireEvent.change(screen.getByLabelText('NOMBRE'), { target: { value: 'Algoritmos' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    // A form nobody touched has nothing to lose, and a guard that fires every
    // time is one the user learns to click through without reading.
    it('closes an untouched form without asking', () => {
      const onClose = vi.fn()
      renderForm(onClose)

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('dialog', { name: 'Descartar cambios' })).not.toBeInTheDocument()
    })

    it('guards Escape too, and Escape on the question keeps the form', () => {
      const onClose = vi.fn()
      renderForm(onClose)
      fireEvent.change(screen.getByLabelText('NOMBRE'), { target: { value: 'Algoritmos' } })

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog', { name: 'Descartar cambios' })).toBeInTheDocument()

      // Both dialogs are mounted and both listen on the document, so this one
      // keystroke must reach only the question.
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog', { name: 'Descartar cambios' })).not.toBeInTheDocument()
      expect(screen.getByLabelText('NOMBRE')).toHaveValue('Algoritmos')
    })
  })

  it('calls onClose when the cancel button is clicked', () => {
    const onClose = vi.fn()
    render(
      <NuevaMateriaModal
        programs={programs}
        defaultPeriodId={7}
        onSubmit={vi.fn()}
        onClose={onClose}
        onGoToCarreras={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// "Todavía no tenés ningún período cargado" — the ONLY control used to be
// "Entendido", which just dismissed the modal even though the body tells the
// user to go create a period in Carreras. "Ir a Carreras" now actually takes
// them there.
describe('NuevaMateriaModal — no periods yet', () => {
  it('offers "Ir a Carreras" instead of a dead-end dismissal', () => {
    const onGoToCarreras = vi.fn()
    render(<NuevaMateriaModal programs={[]} onSubmit={vi.fn()} onClose={vi.fn()} onGoToCarreras={onGoToCarreras} />)

    expect(screen.getByText('Todavía no tenés ningún período cargado')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ir a Carreras' }))

    expect(onGoToCarreras).toHaveBeenCalledTimes(1)
  })
})
