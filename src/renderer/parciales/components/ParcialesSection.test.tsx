// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartialExamRecord } from '../../../shared/ipc/materias'
import { ParcialesSection } from './ParcialesSection'

const aprobado: PartialExamRecord = {
  id: 1,
  subjectId: 7,
  label: '1er parcial',
  takenOn: '2026-05-12',
  result: 'aprobado',
  grade: 8
}

const pendienteSinFecha: PartialExamRecord = {
  id: 2,
  subjectId: 7,
  label: 'Recuperatorio 1',
  takenOn: null,
  result: 'pendiente',
  grade: null
}

describe('ParcialesSection', () => {
  // The visible <h3> became the PARCIALES tab in the subject detail; the name
  // survives as the section's accessible label. The add action still renders
  // here when the section is mounted OUTSIDE a tab bar — inside one it travels
  // to the tab row through `TabActionSlot`.
  it('names the section and offers its add action', () => {
    render(<ParcialesSection parciales={[]} onAdd={vi.fn()} onEdit={vi.fn()} />)

    expect(screen.getByRole('region', { name: 'PARCIALES' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar parcial' })).toBeInTheDocument()
  })

  it('tells the student nothing is recorded yet', () => {
    render(<ParcialesSection parciales={[]} onAdd={vi.fn()} onEdit={vi.fn()} />)

    expect(screen.getByText(/Todavía no anotaste ningún parcial/)).toBeInTheDocument()
  })

  // Both result states in one render: the approved badge carries its nota,
  // the pending one says the date has not been published.
  it('renders an approved parcial with the nota inside its badge', () => {
    render(<ParcialesSection parciales={[aprobado, pendienteSinFecha]} onAdd={vi.fn()} onEdit={vi.fn()} />)

    expect(screen.getByText('Aprobado · 8')).toBeInTheDocument()
    expect(screen.getByText('12 may 2026')).toBeInTheDocument()
  })

  it('renders a pending parcial whose date the cátedra has not published', () => {
    render(<ParcialesSection parciales={[aprobado, pendienteSinFecha]} onAdd={vi.fn()} onEdit={vi.fn()} />)

    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(screen.getByText('Sin fecha todavía')).toBeInTheDocument()
  })

  it('renders a reprobado parcial with its nota', () => {
    const reprobado: PartialExamRecord = { ...aprobado, id: 3, label: '2do parcial', result: 'reprobado', grade: 3 }

    render(<ParcialesSection parciales={[reprobado]} onAdd={vi.fn()} onEdit={vi.fn()} />)

    expect(screen.getByText('Reprobado · 3')).toBeInTheDocument()
  })

  it('opens the creation form from the add button', () => {
    const onAdd = vi.fn()
    render(<ParcialesSection parciales={[]} onAdd={onAdd} onEdit={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Agregar parcial' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  // The row body is the ONE entry point to editing (and to deleting, which
  // lives in the reused form's footer) — same rule the entregas row follows.
  it('opens the edit form from the row itself', () => {
    const onEdit = vi.fn()
    render(<ParcialesSection parciales={[aprobado]} onAdd={vi.fn()} onEdit={onEdit} />)

    fireEvent.click(screen.getByRole('button', { name: /1er parcial/ }))

    expect(onEdit).toHaveBeenCalledWith(aprobado)
  })

  // Same convention the finales list follows: a stored date the formatter
  // cannot read renders raw rather than interpolating "undefined".
  it('renders a malformed stored date unformatted', () => {
    const malformed: PartialExamRecord = { ...aprobado, takenOn: '2026-99-12' }

    render(<ParcialesSection parciales={[malformed]} onAdd={vi.fn()} onEdit={vi.fn()} />)

    expect(screen.getByText('2026-99-12')).toBeInTheDocument()
  })
})
