// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClassNoteRecord } from '../../../shared/ipc/materias'
import { ApuntesSection } from './ApuntesSection'

const notes: ClassNoteRecord[] = [
  { id: 1, subjectId: 7, date: '2026-08-07', preview: 'Semáforos y exclusión mutua. Entra en el parcial.' },
  { id: 2, subjectId: 7, date: '2026-08-14', preview: 'Planificación: round robin, quantum y starvation.' }
]

describe('ApuntesSection (approved design — left column, between NOTAS and ADJUNTOS)', () => {
  it('lists each apunte with its short date', () => {
    render(<ApuntesSection notes={notes} onOpenApunte={vi.fn()} />)

    expect(screen.getByText('APUNTES DE CLASE')).toBeInTheDocument()
    expect(screen.getByText('14 ago')).toBeInTheDocument()
    expect(screen.getByText('Planificación: round robin, quantum y starvation.')).toBeInTheDocument()
    expect(screen.getByText('07 ago')).toBeInTheDocument()
  })

  // Newest first: an apunte is read to remember the last class, not the first
  // one of the cuatrimestre.
  it('orders the apuntes newest first, whatever order they arrive in', () => {
    render(<ApuntesSection notes={notes} onOpenApunte={vi.fn()} />)

    const rows = screen.getAllByTestId('subject-detail-apunte')
    expect(rows[0]).toHaveTextContent('14 ago')
    expect(rows[1]).toHaveTextContent('07 ago')
  })

  // This section is a READ surface with no add button: an apunte belongs to a
  // class, so it is written from the class. The row is the way back into it.
  it('offers no way to add an apunte from here', () => {
    render(<ApuntesSection notes={notes} onOpenApunte={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /agregar/i })).not.toBeInTheDocument()
  })

  /*
   * By the apunte's ATTACHMENT id, not by its date: the row's job is to open
   * a document in the markdown editor, and the editor addresses documents by
   * id. A date would make the caller look the apunte up all over again.
   */
  it('opens the apunte it lists', async () => {
    const onOpenApunte = vi.fn()
    render(<ApuntesSection notes={notes} onOpenApunte={onOpenApunte} />)

    await userEvent.click(screen.getAllByTestId('subject-detail-apunte')[0]!)

    expect(onOpenApunte).toHaveBeenCalledWith(notes.find((note) => note.date === '2026-08-14')!.id)
  })

  it('says so plainly when nothing has been written yet', () => {
    render(<ApuntesSection notes={[]} onOpenApunte={vi.fn()} />)

    expect(
      screen.getByText('Todavía no escribiste ningún apunte. Se escriben desde la clase, en Hoy o en el Horario.')
    ).toBeInTheDocument()
    expect(screen.queryByTestId('subject-detail-apunte')).not.toBeInTheDocument()
  })
})
