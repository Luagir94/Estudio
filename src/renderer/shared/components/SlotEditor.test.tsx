// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SlotEditor } from './SlotEditor'

describe('SlotEditor', () => {
  it('renders one row per slot in value, with its stored start/end time', () => {
    render(
      <SlotEditor
        value={[
          { dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: 'Aula 4' },
          { dayOfWeek: 3, startMinutes: 480, endMinutes: 540, location: null }
        ]}
        onChange={vi.fn()}
      />
    )

    const startInputs = screen.getAllByLabelText('HORA DE INICIO')
    expect(startInputs).toHaveLength(2)
    expect(startInputs[0]).toHaveValue('10:00')
    expect(startInputs[1]).toHaveValue('08:00')
  })

  it('adds a new slot when "Agregar horario" is clicked', () => {
    const onChange = vi.fn()
    render(<SlotEditor value={[]} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Agregar horario' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const [newSlots] = onChange.mock.calls[0] as [Array<{ dayOfWeek: number }>]
    expect(newSlots).toHaveLength(1)
  })

  it('emits an updated startMinutes when the start time input changes', () => {
    const onChange = vi.fn()
    render(
      <SlotEditor value={[{ dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: null }]} onChange={onChange} />
    )

    fireEvent.change(screen.getByLabelText('HORA DE INICIO'), { target: { value: '09:30' } })

    expect(onChange).toHaveBeenCalledWith([{ dayOfWeek: 1, startMinutes: 570, endMinutes: 660, location: null }])
  })

  it('removes the slot when its remove button is clicked', () => {
    const onChange = vi.fn()
    render(
      <SlotEditor
        value={[
          { dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: 'Aula 4' },
          { dayOfWeek: 3, startMinutes: 480, endMinutes: 540, location: null }
        ]}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar horario' })[0]!)

    expect(onChange).toHaveBeenCalledWith([{ dayOfWeek: 3, startMinutes: 480, endMinutes: 540, location: null }])
  })
})

/*
 * The grid can now show two classes at the same hour side by side, but
 * finding out about a clash by spotting it on the weekly grid afterwards is
 * too late. This warns at the moment the class is being loaded. It is a
 * WARNING, not a validation error: overlapping classes are a real situation
 * (two commissions of the same subject, a class you still have to choose
 * between), so the form stays submittable.
 */
describe('SlotEditor — overlap warnings', () => {
  it("warns when a row collides with another subject's committed class", () => {
    render(
      <SlotEditor
        value={[{ dayOfWeek: 1, startMinutes: 480, endMinutes: 600, location: null }]}
        onChange={vi.fn()}
        busySlots={[{ subjectName: 'ITICS', dayOfWeek: 1, startMinutes: 540, endMinutes: 660 }]}
      />
    )

    expect(screen.getByText('Se superpone con ITICS · Lunes 09:00 – 11:00')).toBeInTheDocument()
  })

  it('warns on both rows when a subject double-books itself', () => {
    render(
      <SlotEditor
        value={[
          { dayOfWeek: 3, startMinutes: 480, endMinutes: 600, location: null },
          { dayOfWeek: 3, startMinutes: 540, endMinutes: 660, location: null }
        ]}
        onChange={vi.fn()}
      />
    )

    expect(screen.getAllByText(/Se superpone con otro horario de esta materia/)).toHaveLength(2)
  })

  it('stays quiet for back-to-back classes', () => {
    render(
      <SlotEditor
        value={[{ dayOfWeek: 1, startMinutes: 480, endMinutes: 540, location: null }]}
        onChange={vi.fn()}
        busySlots={[{ subjectName: 'ITICS', dayOfWeek: 1, startMinutes: 540, endMinutes: 600 }]}
      />
    )

    expect(screen.queryByText(/Se superpone/)).not.toBeInTheDocument()
  })

  it('stays quiet for the same hours on a different day', () => {
    render(
      <SlotEditor
        value={[{ dayOfWeek: 1, startMinutes: 480, endMinutes: 540, location: null }]}
        onChange={vi.fn()}
        busySlots={[{ subjectName: 'ITICS', dayOfWeek: 2, startMinutes: 480, endMinutes: 540 }]}
      />
    )

    expect(screen.queryByText(/Se superpone/)).not.toBeInTheDocument()
  })

  it('stays quiet when no busy slots are supplied at all', () => {
    render(
      <SlotEditor value={[{ dayOfWeek: 1, startMinutes: 480, endMinutes: 540, location: null }]} onChange={vi.fn()} />
    )

    expect(screen.queryByText(/Se superpone/)).not.toBeInTheDocument()
  })

  it('leaves the clashing row fully editable — the warning never blocks', () => {
    const onChange = vi.fn()
    render(
      <SlotEditor
        value={[{ dayOfWeek: 1, startMinutes: 480, endMinutes: 600, location: null }]}
        onChange={onChange}
        busySlots={[{ subjectName: 'ITICS', dayOfWeek: 1, startMinutes: 540, endMinutes: 660 }]}
      />
    )

    fireEvent.change(screen.getByLabelText('HORA DE INICIO'), { target: { value: '07:00' } })

    expect(onChange).toHaveBeenCalledWith([{ dayOfWeek: 1, startMinutes: 420, endMinutes: 600, location: null }])
  })
})
