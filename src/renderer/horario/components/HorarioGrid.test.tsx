// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WeekDayColumn } from '../domain/weekProjection'
import { HorarioGrid } from './HorarioGrid'

function emptyColumns(): WeekDayColumn[] {
  return [
    { mondayFirstIndex: 0, dayOfWeek: 1, slots: [] },
    { mondayFirstIndex: 1, dayOfWeek: 2, slots: [] },
    { mondayFirstIndex: 2, dayOfWeek: 3, slots: [] },
    { mondayFirstIndex: 3, dayOfWeek: 4, slots: [] },
    { mondayFirstIndex: 4, dayOfWeek: 5, slots: [] },
    { mondayFirstIndex: 5, dayOfWeek: 6, slots: [] },
    { mondayFirstIndex: 6, dayOfWeek: 0, slots: [] }
  ]
}

describe('HorarioGrid', () => {
  /*
   * The grid renders all SEVEN days. SlotEditor lets a subject be scheduled on
   * Saturday or Sunday, so a five-column grid silently hid slots that had been
   * saved and were visible on the subject detail screen. The .pen design was
   * updated to match.
   */
  it('renders all seven day headers, Monday-first, including the weekend', () => {
    render(<HorarioGrid columns={emptyColumns()} todayMondayFirstIndex={null} onSelectClass={vi.fn()} />)

    for (const label of ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    expect(screen.getAllByRole('list')).toHaveLength(7)
  })

  it('renders a slot saved on Sunday, the last Monday-first column', () => {
    const columns = emptyColumns()
    columns[6] = {
      mondayFirstIndex: 6,
      dayOfWeek: 0,
      slots: [
        {
          slotId: 10,
          dayOfWeek: 0,
          subjectId: 1,
          subjectName: 'Taller de Domingo',
          subjectColor: '#4c8dff',
          startMinutes: 9 * 60,
          endMinutes: 11 * 60,
          location: 'Aula 1'
        }
      ]
    }

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onSelectClass={vi.fn()} />)

    expect(screen.getByText('Taller de Domingo')).toBeInTheDocument()
  })

  it('renders a class block with subject name and formatted time range', () => {
    const columns = emptyColumns()
    columns[0] = {
      mondayFirstIndex: 0,
      dayOfWeek: 1,
      slots: [
        {
          subjectId: 7,
          subjectName: 'Sistemas Operativos',
          subjectColor: '#4c8dff',
          slotId: 100,
          dayOfWeek: 1,
          startMinutes: 480,
          endMinutes: 570,
          location: 'Aula 204'
        }
      ]
    }

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onSelectClass={vi.fn()} />)

    expect(screen.getByText('Sistemas Operativos')).toBeInTheDocument()
    expect(screen.getByText('08:00 – 09:30')).toBeInTheDocument()
  })

  it('clicking a class block calls onSelectClass with its subjectId', () => {
    const columns = emptyColumns()
    columns[0] = {
      mondayFirstIndex: 0,
      dayOfWeek: 1,
      slots: [
        {
          subjectId: 7,
          subjectName: 'Sistemas Operativos',
          subjectColor: '#4c8dff',
          slotId: 100,
          dayOfWeek: 1,
          startMinutes: 480,
          endMinutes: 570,
          location: 'Aula 204'
        }
      ]
    }
    const onSelectClass = vi.fn()

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onSelectClass={onSelectClass} />)

    fireEvent.click(screen.getByRole('button', { name: /Sistemas Operativos/ }))

    expect(onSelectClass).toHaveBeenCalledWith(7)
  })

  it("marks today's column with data-today so it can be visually highlighted (design: accent column)", () => {
    render(<HorarioGrid columns={emptyColumns()} todayMondayFirstIndex={3} onSelectClass={vi.fn()} />)

    const columnsRendered = screen.getAllByRole('list')
    expect(columnsRendered[3]).toHaveAttribute('data-today', 'true')
    expect(columnsRendered[0]).toHaveAttribute('data-today', 'false')
  })

  /*
   * The gutter used to stop at 20:00, so evening classes fell outside the
   * grid body. It now runs 08:00..22:00 in 2-hour rows, covering up to 24:00.
   */
  it('renders hour marks from 08:00 through 22:00', () => {
    render(<HorarioGrid columns={emptyColumns()} todayMondayFirstIndex={null} onSelectClass={vi.fn()} />)

    for (const mark of ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']) {
      expect(screen.getByText(mark)).toBeInTheDocument()
    }
  })

  it('renders a late class that ends at 23:00 inside the grid', () => {
    const columns = emptyColumns()
    columns[0] = {
      mondayFirstIndex: 0,
      dayOfWeek: 1,
      slots: [
        {
          subjectId: 9,
          subjectName: 'Redes Nocturno',
          subjectColor: '#4c8dff',
          slotId: 200,
          dayOfWeek: 1,
          startMinutes: 21 * 60,
          endMinutes: 23 * 60,
          location: 'Aula 12'
        }
      ]
    }

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onSelectClass={vi.fn()} />)

    expect(screen.getByText('Redes Nocturno')).toBeInTheDocument()
    expect(screen.getByText('21:00 – 23:00')).toBeInTheDocument()
  })

  /*
   * The grid stretches to whatever height the screen gives it, so day columns
   * carry no inline pixel height and blocks are placed as a percentage of the
   * 08:00..24:00 window (960 minutes) instead of a fixed px-per-minute scale.
   */
  it('gives day columns no fixed pixel height so they fill the available space', () => {
    render(<HorarioGrid columns={emptyColumns()} todayMondayFirstIndex={null} onSelectClass={vi.fn()} />)

    for (const column of screen.getAllByRole('list')) {
      expect(column.style.height).toBe('')
    }
  })

  it('positions a class block as a percentage of the 08:00..24:00 window', () => {
    const columns = emptyColumns()
    columns[0] = {
      mondayFirstIndex: 0,
      dayOfWeek: 1,
      slots: [
        {
          subjectId: 7,
          subjectName: 'Sistemas Operativos',
          subjectColor: '#4c8dff',
          slotId: 100,
          dayOfWeek: 1,
          startMinutes: 10 * 60,
          endMinutes: 12 * 60,
          location: 'Aula 204'
        }
      ]
    }

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onSelectClass={vi.fn()} />)

    const block = screen.getByRole('button', { name: /Sistemas Operativos/ })
    expect(block).toHaveStyle({ top: '12.5%', height: '12.5%' })
  })

  /*
   * A short window shrinks every block proportionally. Without a floor, a
   * one-hour class collapsed under one line of text and `overflow-hidden`
   * sliced the subject name in half. The floor is the design's 8px padding
   * on both edges plus one 11px line at line-height 1.15.
   */
  it('never renders a class block shorter than one line of text', () => {
    const columns = emptyColumns()
    columns[0] = {
      mondayFirstIndex: 0,
      dayOfWeek: 1,
      slots: [
        {
          subjectId: 7,
          subjectName: 'Sistemas Operativos',
          subjectColor: '#4c8dff',
          slotId: 100,
          dayOfWeek: 1,
          startMinutes: 10 * 60,
          endMinutes: 10 * 60 + 30,
          location: 'Aula 204'
        }
      ]
    }

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onSelectClass={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Sistemas Operativos/ })).toHaveStyle({ minHeight: '30px' })
  })

  /*
   * That floor only buys ONE line, so a short block still cannot show the
   * time — and `overflow-hidden` used to slice those digits in half
   * lengthwise, which reads as a broken block rather than a small one. The
   * time is dropped whole instead, via a container query on a padding-free
   * wrapper so the threshold is measured against the text box and nothing
   * else.
   *
   * jsdom does not evaluate container queries, so this locks the mechanism
   * rather than the rendering: without the guard the clipping comes back and
   * nothing else in the suite would notice.
   */
  it('guards the class time behind a size container instead of clipping it', () => {
    const columns = emptyColumns()
    columns[0] = {
      mondayFirstIndex: 0,
      dayOfWeek: 1,
      slots: [
        {
          subjectId: 7,
          subjectName: 'Sistemas Operativos',
          subjectColor: '#4c8dff',
          slotId: 100,
          dayOfWeek: 1,
          startMinutes: 10 * 60,
          endMinutes: 10 * 60 + 30,
          location: 'Aula 204'
        }
      ]
    }

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onSelectClass={vi.fn()} />)

    const time = screen.getByText('10:00 – 10:30')
    expect(time).toHaveClass('[@container(max-height:30px)]:hidden')
    expect(time.parentElement).toHaveClass('[container-type:size]')
  })

  it('renders no class blocks for a day with zero slots', () => {
    render(<HorarioGrid columns={emptyColumns()} todayMondayFirstIndex={null} onSelectClass={vi.fn()} />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
