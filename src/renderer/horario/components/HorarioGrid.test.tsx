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

function withSaturdayClass(): WeekDayColumn[] {
  const columns = emptyColumns()
  columns[5] = {
    mondayFirstIndex: 5,
    dayOfWeek: 6,
    slots: [
      {
        slotId: 60,
        dayOfWeek: 6,
        subjectId: 2,
        subjectName: 'Taller de Sábado',
        subjectColor: '#22d3ee',
        startMinutes: 600,
        endMinutes: 720,
        location: null
      }
    ]
  }
  return columns
}

describe('HorarioGrid', () => {
  /*
   * The grid renders all SEVEN days. SlotEditor lets a subject be scheduled on
   * Saturday or Sunday, so a five-column grid silently hid slots that had been
   * saved and were visible on the subject detail screen. The .pen design was
   * updated to match. (A Saturday class keeps the weekend un-collapsed here —
   * the empty-weekend collapse has its own describe below.)
   */
  it('renders all seven day headers, Monday-first, including the weekend', () => {
    render(
      <HorarioGrid
        columns={withSaturdayClass()}
        todayMondayFirstIndex={null}
        onOpenApunte={vi.fn()}
        onOpenClase={vi.fn()}
      />
    )

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

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onOpenApunte={vi.fn()} onOpenClase={vi.fn()} />)

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

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onOpenApunte={vi.fn()} onOpenClase={vi.fn()} />)

    expect(screen.getByText('Sistemas Operativos')).toBeInTheDocument()
    expect(screen.getByText('08:00 – 09:30')).toBeInTheDocument()
  })

  it('clicking a class block body opens that class, dated to the current week', () => {
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
    const onOpenClase = vi.fn()

    render(
      <HorarioGrid columns={columns} todayMondayFirstIndex={null} onOpenApunte={vi.fn()} onOpenClase={onOpenClase} />
    )

    fireEvent.click(screen.getByTestId('horario-class-block'))

    expect(onOpenClase).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 7, dayOfWeek: 1, startMinutes: 480 }))
  })

  it("marks today's column with data-today so it can be visually highlighted (design: accent column)", () => {
    render(
      <HorarioGrid columns={emptyColumns()} todayMondayFirstIndex={3} onOpenApunte={vi.fn()} onOpenClase={vi.fn()} />
    )

    const columnsRendered = screen.getAllByRole('list')
    expect(columnsRendered[3]).toHaveAttribute('data-today', 'true')
    expect(columnsRendered[0]).toHaveAttribute('data-today', 'false')
  })

  /*
   * The gutter used to stop at 20:00, so evening classes fell outside the
   * grid body. It now runs 08:00..22:00 in 2-hour rows, covering up to 24:00.
   */
  it('renders hour marks from 08:00 through 22:00', () => {
    render(
      <HorarioGrid columns={emptyColumns()} todayMondayFirstIndex={null} onOpenApunte={vi.fn()} onOpenClase={vi.fn()} />
    )

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

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onOpenApunte={vi.fn()} onOpenClase={vi.fn()} />)

    expect(screen.getByText('Redes Nocturno')).toBeInTheDocument()
    expect(screen.getByText('21:00 – 23:00')).toBeInTheDocument()
  })

  /*
   * The grid stretches to whatever height the screen gives it, so day columns
   * carry no inline pixel height and blocks are placed as a percentage of the
   * 08:00..24:00 window (960 minutes) instead of a fixed px-per-minute scale.
   */
  it('gives day columns no fixed pixel height so they fill the available space', () => {
    render(
      <HorarioGrid columns={emptyColumns()} todayMondayFirstIndex={null} onOpenApunte={vi.fn()} onOpenClase={vi.fn()} />
    )

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

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onOpenApunte={vi.fn()} onOpenClase={vi.fn()} />)

    const block = screen.getByTestId('horario-class-block')
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

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onOpenApunte={vi.fn()} onOpenClase={vi.fn()} />)

    expect(screen.getByTestId('horario-class-block')).toHaveStyle({ minHeight: '30px' })
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

    render(<HorarioGrid columns={columns} todayMondayFirstIndex={null} onOpenApunte={vi.fn()} onOpenClase={vi.fn()} />)

    const time = screen.getByText('10:00 – 10:30')
    expect(time).toHaveClass('[@container(max-height:30px)]:hidden')
    expect(time.parentElement).toHaveClass('[container-type:size]')
  })

  it('renders no class blocks for a day with zero slots', () => {
    render(
      <HorarioGrid columns={emptyColumns()} todayMondayFirstIndex={null} onOpenApunte={vi.fn()} onOpenClase={vi.fn()} />
    )

    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  describe('weekend collapse (both weekend days empty -> narrow, dimmed SÁB/DOM columns)', () => {
    it('collapses the weekend columns when neither Saturday nor Sunday has a class', () => {
      render(
        <HorarioGrid
          columns={emptyColumns()}
          todayMondayFirstIndex={null}
          onOpenApunte={vi.fn()}
          onOpenClase={vi.fn()}
        />
      )

      expect(screen.getByText('SÁB')).toBeInTheDocument()
      expect(screen.getByText('DOM')).toBeInTheDocument()
      expect(screen.queryByText('Sábado')).not.toBeInTheDocument()
      expect(screen.queryByText('Domingo')).not.toBeInTheDocument()

      const columns = screen.getAllByRole('list')
      for (const weekendColumn of [columns[5]!, columns[6]!]) {
        expect(weekendColumn).toHaveClass('flex-[0.35]', 'opacity-55')
        expect(weekendColumn).not.toHaveClass('flex-1')
      }
      expect(columns[0]).toHaveClass('flex-1')
      expect(columns[0]).not.toHaveClass('opacity-55')
    })

    it('renders all seven columns normally when a weekend day has a class', () => {
      render(
        <HorarioGrid
          columns={withSaturdayClass()}
          todayMondayFirstIndex={null}
          onOpenApunte={vi.fn()}
          onOpenClase={vi.fn()}
        />
      )

      expect(screen.getByText('Sábado')).toBeInTheDocument()
      expect(screen.getByText('Domingo')).toBeInTheDocument()
      expect(screen.queryByText('SÁB')).not.toBeInTheDocument()

      for (const column of screen.getAllByRole('list')) {
        expect(column).toHaveClass('flex-1')
        expect(column).not.toHaveClass('opacity-55')
      }
    })
  })

  describe('"now" line (today\'s column only, on the same 08:00..24:00 scale as class blocks)', () => {
    it("renders the 2px violet line with its 8px dot at the current time in today's column", () => {
      render(
        <HorarioGrid
          columns={emptyColumns()}
          todayMondayFirstIndex={0}
          now={new Date(2026, 7, 10, 12, 0)} // Monday 12:00 — 240 of 960 minutes into 08:00..24:00
          onOpenApunte={vi.fn()}
          onOpenClase={vi.fn()}
        />
      )

      const line = screen.getByTestId('now-indicator')
      expect(line).toHaveStyle({ top: '25%' })
      expect(line).toHaveClass('h-0.5', 'bg-violet')
      expect(line.firstElementChild).toHaveClass('h-2', 'w-2', 'rounded-full', 'bg-violet')
      expect(screen.getAllByRole('list')[0]).toContainElement(line)
    })

    it('renders no line when the current time falls outside the visible range', () => {
      render(
        <HorarioGrid
          columns={emptyColumns()}
          todayMondayFirstIndex={0}
          now={new Date(2026, 7, 10, 7, 0)}
          onOpenApunte={vi.fn()}
          onOpenClase={vi.fn()}
        />
      )

      expect(screen.queryByTestId('now-indicator')).not.toBeInTheDocument()
    })

    it('renders no line when no column is today', () => {
      render(
        <HorarioGrid
          columns={emptyColumns()}
          todayMondayFirstIndex={null}
          now={new Date(2026, 7, 10, 12, 0)}
          onOpenApunte={vi.fn()}
          onOpenClase={vi.fn()}
        />
      )

      expect(screen.queryByTestId('now-indicator')).not.toBeInTheDocument()
    })
  })
})

describe('HorarioGrid — classes sharing the same hours', () => {
  function mondayWith(slots: WeekDayColumn['slots']): WeekDayColumn[] {
    const columns = emptyColumns()
    columns[0] = { mondayFirstIndex: 0, dayOfWeek: 1, slots }
    return columns
  }

  function mondaySlot(slotId: number, subjectName: string, startMinutes: number, endMinutes: number) {
    return {
      slotId,
      dayOfWeek: 1,
      subjectId: slotId,
      subjectName,
      subjectColor: '#4c8dff',
      startMinutes,
      endMinutes,
      location: null
    }
  }

  /*
   * The bug: two classes at the same hour were painted at the same left edge
   * with the same width, so the last one drawn covered the other completely
   * and a class disappeared from the week with nothing to hint it was there.
   */
  it('renders BOTH classes when two share the same hour', () => {
    render(
      <HorarioGrid
        columns={mondayWith([mondaySlot(1, 'ITICS', 480, 540), mondaySlot(2, 'Análisis Matemático', 480, 540)])}
        todayMondayFirstIndex={null}
        onOpenApunte={vi.fn()}
        onOpenClase={vi.fn()}
      />
    )

    expect(screen.getByText('ITICS')).toBeInTheDocument()
    expect(screen.getByText('Análisis Matemático')).toBeInTheDocument()
  })

  it('offsets the two blocks to different lanes of the same width', () => {
    render(
      <HorarioGrid
        columns={mondayWith([mondaySlot(1, 'ITICS', 480, 540), mondaySlot(2, 'Análisis Matemático', 480, 540)])}
        todayMondayFirstIndex={null}
        onOpenApunte={vi.fn()}
        onOpenClase={vi.fn()}
      />
    )

    const [first, second] = screen.getAllByTestId('horario-class-block')

    expect(first!.style.left).not.toBe(second!.style.left)
    expect(first!.style.width).toBe(second!.style.width)
  })

  it('keeps a class with no collision on the full column width', () => {
    render(
      <HorarioGrid
        columns={mondayWith([mondaySlot(1, 'ITICS', 480, 540), mondaySlot(2, 'Análisis Matemático', 600, 660)])}
        todayMondayFirstIndex={null}
        onOpenApunte={vi.fn()}
        onOpenClase={vi.fn()}
      />
    )

    const [first, second] = screen.getAllByTestId('horario-class-block')

    expect(first!.style.left).toBe(second!.style.left)
    expect(first!.style.width).toBe(second!.style.width)
  })

  it('still routes a click on a shared-hour block to its own class', () => {
    const onOpenClase = vi.fn()
    render(
      <HorarioGrid
        columns={mondayWith([mondaySlot(1, 'ITICS', 480, 540), mondaySlot(2, 'Análisis Matemático', 480, 540)])}
        todayMondayFirstIndex={null}
        onOpenApunte={vi.fn()}
        onOpenClase={onOpenClase}
      />
    )

    fireEvent.click(screen.getByText('Análisis Matemático'))

    expect(onOpenClase).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 2 }))
  })

  /*
   * Three classes at the same hour leave each lane ~60px wide, which truncates
   * the name to a few characters and hides the time entirely. The block still
   * has to be identifiable, so it carries the whole thing as a tooltip — the
   * one place the hidden information is recoverable without a click.
   */
  it('carries the full subject name and hours as a tooltip', () => {
    render(
      <HorarioGrid
        columns={mondayWith([mondaySlot(1, 'Análisis Matemático II', 480, 600)])}
        todayMondayFirstIndex={null}
        onOpenApunte={vi.fn()}
        onOpenClase={vi.fn()}
      />
    )

    expect(screen.getByTestId('horario-class-block')).toHaveAttribute('title', 'Análisis Matemático II · 08:00 – 10:00')
  })
})

describe('HorarioGrid — the two things a class block can do', () => {
  function mondayColumns(): WeekDayColumn[] {
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
    return columns
  }

  /*
   * The schedule is edited a handful of times a cuatrimestre; the class it
   * describes is worked with every week. So the block BODY opens the class and
   * the schedule keeps a corner control — the same split ClassRow already
   * makes in Hoy, where the notebook button sits beside the attendance pair.
   */
  it('offers the apunte as its own control, not as the block body', () => {
    const onOpenApunte = vi.fn()
    const onOpenClase = vi.fn()

    render(
      <HorarioGrid
        columns={mondayColumns()}
        todayMondayFirstIndex={null}
        onOpenApunte={onOpenApunte}
        onOpenClase={onOpenClase}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Apunte de la clase de Sistemas Operativos' }))

    expect(onOpenApunte).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 7 }))
    expect(onOpenClase).not.toHaveBeenCalled()
  })

  /*
   * A <button> cannot contain another <button>, so the corner control is a
   * SIBLING laid over the block rather than a child of it. If it ever became a
   * child the markup would be invalid and the browser would reparent it,
   * silently breaking both clicks.
   */
  it('keeps the apunte control outside the block body', () => {
    render(
      <HorarioGrid
        columns={mondayColumns()}
        todayMondayFirstIndex={null}
        onOpenApunte={vi.fn()}
        onOpenClase={vi.fn()}
      />
    )

    const block = screen.getByTestId('horario-class-block')
    const edit = screen.getByRole('button', { name: 'Apunte de la clase de Sistemas Operativos' })

    expect(block).not.toContainElement(edit)
  })

  /*
   * The control is positioned OFF the block's box, so its left edge is the
   * block's own `calc()` lane geometry composed one level deeper. If that
   * composition ever produced something the CSS parser drops, the control
   * would silently pile up at the column's left edge on top of the block.
   */
  it('anchors the apunte control to the block lane it belongs to', () => {
    render(
      <HorarioGrid
        columns={mondayColumns()}
        todayMondayFirstIndex={null}
        onOpenApunte={vi.fn()}
        onOpenClase={vi.fn()}
      />
    )

    const edit = screen.getByTestId('horario-class-apunte')

    expect(edit.style.left).toContain('21px')
    expect(edit.style.top).not.toBe('')
  })

  it('gives every class its own apunte control when two share an hour', () => {
    const columns = emptyColumns()
    columns[0] = {
      mondayFirstIndex: 0,
      dayOfWeek: 1,
      slots: [
        {
          subjectId: 1,
          subjectName: 'ITICS',
          subjectColor: '#4c8dff',
          slotId: 1,
          dayOfWeek: 1,
          startMinutes: 480,
          endMinutes: 540,
          location: null
        },
        {
          subjectId: 2,
          subjectName: 'Análisis Matemático',
          subjectColor: '#4c8dff',
          slotId: 2,
          dayOfWeek: 1,
          startMinutes: 480,
          endMinutes: 540,
          location: null
        }
      ]
    }
    const onOpenApunte = vi.fn()

    render(
      <HorarioGrid columns={columns} todayMondayFirstIndex={null} onOpenApunte={onOpenApunte} onOpenClase={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Apunte de la clase de Análisis Matemático' }))

    expect(onOpenApunte).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 2 }))
  })
})
