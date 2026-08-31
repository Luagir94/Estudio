// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SubjectActionsMenu } from './SubjectActionsMenu'

function renderMenu(): { onEdit: ReturnType<typeof vi.fn>; onDelete: ReturnType<typeof vi.fn> } {
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(<SubjectActionsMenu onEdit={onEdit} onDelete={onDelete} />)
  return { onEdit, onDelete }
}

describe('SubjectActionsMenu', () => {
  it('starts closed, showing only the trigger', () => {
    renderMenu()

    expect(screen.getByRole('button', { name: 'Más acciones' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens the menu with both actions', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Más acciones' }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Editar materia' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Eliminar materia' })).toBeInTheDocument()
  })

  it('reports the edit choice and closes', async () => {
    const user = userEvent.setup()
    const { onEdit } = renderMenu()

    await user.click(screen.getByRole('button', { name: 'Más acciones' }))
    await user.click(screen.getByRole('menuitem', { name: 'Editar materia' }))

    expect(onEdit).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('reports the delete choice and closes', async () => {
    const user = userEvent.setup()
    const { onDelete } = renderMenu()

    await user.click(screen.getByRole('button', { name: 'Más acciones' }))
    await user.click(screen.getByRole('menuitem', { name: 'Eliminar materia' }))

    expect(onDelete).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // A menu you can open with the keyboard but not close with it is a trap.
  it('closes on Escape and hands focus back to the trigger', async () => {
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Más acciones' })

    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes when the click lands outside it', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Más acciones' }))
    await user.click(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
