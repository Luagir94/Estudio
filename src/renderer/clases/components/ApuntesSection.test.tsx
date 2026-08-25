// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClassNoteRecord } from '../../../shared/ipc/materias'
import { ApuntesSection } from './ApuntesSection'

const notes: ClassNoteRecord[] = [
  { id: 1, subjectId: 7, date: '2026-08-07', body: 'Semáforos y exclusión mutua. Entra en el parcial.' },
  { id: 2, subjectId: 7, date: '2026-08-14', body: 'Planificación: round robin, quantum y starvation.' }
]

describe('ApuntesSection (approved design — left column, between NOTAS and ADJUNTOS)', () => {
  it('lists each apunte with its short date', () => {
    render(<ApuntesSection notes={notes} onOpenClase={vi.fn()} />)

    expect(screen.getByText('APUNTES DE CLASE')).toBeInTheDocument()
    expect(screen.getByText('14 ago')).toBeInTheDocument()
    expect(screen.getByText('Planificación: round robin, quantum y starvation.')).toBeInTheDocument()
    expect(screen.getByText('07 ago')).toBeInTheDocument()
  })

  // Newest first: an apunte is read to remember the last class, not the first
  // one of the cuatrimestre.
  it('orders the apuntes newest first, whatever order they arrive in', () => {
    render(<ApuntesSection notes={notes} onOpenClase={vi.fn()} />)

    const rows = screen.getAllByTestId('subject-detail-apunte')
    expect(rows[0]).toHaveTextContent('14 ago')
    expect(rows[1]).toHaveTextContent('07 ago')
  })

  // This section is a READ surface with no add button: an apunte belongs to a
  // class, so it is written from the class. The row is the way back into it.
  it('offers no way to add an apunte from here', () => {
    render(<ApuntesSection notes={notes} onOpenClase={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /agregar/i })).not.toBeInTheDocument()
  })

  it('opens the class the apunte belongs to', async () => {
    const onOpenClase = vi.fn()
    render(<ApuntesSection notes={notes} onOpenClase={onOpenClase} />)

    await userEvent.click(screen.getAllByTestId('subject-detail-apunte')[0]!)

    expect(onOpenClase).toHaveBeenCalledWith('2026-08-14')
  })

  it('says so plainly when nothing has been written yet', () => {
    render(<ApuntesSection notes={[]} onOpenClase={vi.fn()} />)

    expect(screen.getByText('Todavía no escribiste ningún apunte. Se escriben desde la clase.')).toBeInTheDocument()
    expect(screen.queryByTestId('subject-detail-apunte')).not.toBeInTheDocument()
  })
})
