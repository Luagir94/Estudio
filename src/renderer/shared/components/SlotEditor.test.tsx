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

    const startInputs = screen.getAllByLabelText('Hora de inicio')
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

    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '09:30' } })

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
