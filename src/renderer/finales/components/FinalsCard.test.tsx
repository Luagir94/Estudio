// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FinalExamRecord } from '../../../shared/ipc/materias'
import { FinalsCard } from './FinalsCard'

function final(overrides: Partial<FinalExamRecord> & { id: number }): FinalExamRecord {
  return { subjectId: 1, label: `${overrides.id}ra mesa`, takenOn: null, result: 'pendiente', ...overrides }
}

function renderCard(finals: FinalExamRecord[]) {
  const handlers = { onAdd: vi.fn(), onSetResult: vi.fn(), onDelete: vi.fn(), onGiveUp: vi.fn() }
  render(<FinalsCard finals={finals} {...handlers} />)
  return handlers
}

describe('FinalsCard', () => {
  it('invites the user to record a mesa when there is none', () => {
    renderCard([])

    expect(screen.getByText(/Todavía no anotaste ninguna mesa/)).toBeInTheDocument()
  })

  it('shows an instance with no date as such', () => {
    renderCard([final({ id: 1, takenOn: null })])

    expect(screen.getByText('Sin fecha todavía')).toBeInTheDocument()
  })

  it('shows the date when the mesa has one', () => {
    renderCard([final({ id: 1, takenOn: '2026-08-05' })])

    expect(screen.getByText('2026-08-05')).toBeInTheDocument()
  })

  it('stays in standby while an instance is still open', () => {
    renderCard([final({ id: 1, result: 'reprobado' }), final({ id: 2, result: 'pendiente' })])

    expect(screen.getByText('Standby — final pendiente')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Darla por reprobada' })).not.toBeInTheDocument()
  })

  it('reads as approved once an instance was passed', () => {
    renderCard([final({ id: 1, result: 'reprobado' }), final({ id: 2, result: 'aprobado' })])

    expect(screen.getByText('Aprobada por final')).toBeInTheDocument()
  })

  // The decision prompt is the reason this component exists: with every mesa
  // failed the subject would otherwise sit in standby with no signal.
  it('asks for a decision once every instance was failed', () => {
    renderCard([final({ id: 1, result: 'reprobado' }), final({ id: 2, result: 'reprobado' })])

    expect(screen.getByText(/no queda ninguna\s+abierta/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar otra mesa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Darla por reprobada' })).toBeInTheDocument()
  })

  it('never closes the subject on its own — giving up is an explicit action', async () => {
    const handlers = renderCard([final({ id: 1, result: 'reprobado' })])

    expect(handlers.onGiveUp).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Darla por reprobada' }))

    expect(handlers.onGiveUp).toHaveBeenCalledTimes(1)
  })

  it('records how an instance went', async () => {
    const target = final({ id: 1 })
    const handlers = renderCard([target])

    await userEvent.click(screen.getByRole('button', { name: 'Reprobado' }))

    expect(handlers.onSetResult).toHaveBeenCalledWith(target, 'reprobado')
  })

  it('deletes an instance', async () => {
    const target = final({ id: 1, label: '1ra mesa' })
    const handlers = renderCard([target])

    await userEvent.click(screen.getByRole('button', { name: 'Borrar 1ra mesa' }))

    expect(handlers.onDelete).toHaveBeenCalledWith(target)
  })

  it('opens the add form', async () => {
    const handlers = renderCard([])

    await userEvent.click(screen.getByRole('button', { name: 'Agregar instancia' }))

    expect(handlers.onAdd).toHaveBeenCalled()
  })
})
