// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NuevoDocumentoModal } from './NuevoDocumentoModal'

function renderModal(overrides: Partial<Parameters<typeof NuevoDocumentoModal>[0]> = {}) {
  const onSubmit = vi.fn()
  const onClose = vi.fn()
  render(
    <NuevoDocumentoModal
      subjectId={7}
      subjectName="Sistemas Operativos"
      onSubmit={onSubmit}
      onClose={onClose}
      {...overrides}
    />
  )
  return { onSubmit, onClose }
}

describe('NuevoDocumentoModal', () => {
  it('names the materia it is creating the document for', () => {
    renderModal()

    expect(screen.getByRole('dialog', { name: 'Nuevo documento' })).toBeInTheDocument()
    expect(screen.getByText('Sistemas Operativos')).toBeInTheDocument()
  })

  it('submits the typed name together with the subject the dialog was opened from', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderModal()

    await user.type(screen.getByLabelText('NOMBRE DEL DOCUMENTO'), 'Resumen unidad 3')
    await user.click(screen.getByRole('button', { name: 'Crear y escribir' }))

    expect(onSubmit).toHaveBeenCalledWith({ subjectId: 7, name: 'Resumen unidad 3' })
  })

  // The student names a document, not a file — this line is the only place
  // the two are connected, so it has to track what they type.
  it('previews the file name the typed name will produce', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(screen.getByLabelText('NOMBRE DEL DOCUMENTO'), 'Análisis matemático')

    expect(screen.getByText('Se guarda como analisis-matematico.md')).toBeInTheDocument()
  })

  it('promises no file name while the field is empty', () => {
    renderModal()

    expect(screen.queryByText(/Se guarda como/)).not.toBeInTheDocument()
  })

  it('refuses a blank name instead of creating an unnamed document', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderModal()

    await user.type(screen.getByLabelText('NOMBRE DEL DOCUMENTO'), '   ')
    await user.click(screen.getByRole('button', { name: 'Crear y escribir' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('says the document is not a class apunte', () => {
    renderModal()

    expect(
      screen.getByText(
        'Al crearlo se abre el editor de markdown. No es un apunte de clase: no queda atado a ninguna fecha.'
      )
    ).toBeInTheDocument()
  })

  it('replaces the footer note with the failure when the last submit did not go through', () => {
    renderModal({ error: 'No se pudo crear el documento. Probá de nuevo.' })

    expect(screen.getByText('No se pudo crear el documento. Probá de nuevo.')).toBeInTheDocument()
    expect(screen.queryByText('Se lista en ADJUNTOS')).not.toBeInTheDocument()
  })

  it('locks the submit while the write is in flight so one document cannot be created twice', () => {
    renderModal({ pending: true })

    expect(screen.getByRole('button', { name: 'Crear y escribir' })).toBeDisabled()
  })

  it('closes from Cancelar', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalled()
  })
})
