// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClassRow } from './ClassRow'

describe('ClassRow (design node G07yA — read-only, Hoy has zero write affordances)', () => {
  it('renders subject name, time range, and room', () => {
    render(
      <ClassRow
        subjectName="Sistemas Operativos"
        subjectColor="#4c8dff"
        startMinutes={480}
        endMinutes={570}
        location="Aula 204"
      />
    )

    expect(screen.getByText('Sistemas Operativos')).toBeInTheDocument()
    expect(screen.getByText('08:00')).toBeInTheDocument()
    expect(screen.getByText('09:30')).toBeInTheDocument()
    expect(screen.getByText('Aula 204')).toBeInTheDocument()
  })

  it('renders without a room when location is null, never a stray empty node', () => {
    render(
      <ClassRow
        subjectName="Bases de Datos"
        subjectColor="#2dd4a7"
        startMinutes={600}
        endMinutes={720}
        location={null}
      />
    )

    expect(screen.getByText('Bases de Datos')).toBeInTheDocument()
    expect(screen.queryByText('null')).not.toBeInTheDocument()
  })

  describe('next-class highlight (violet accent border + "starts in" pill; uppercase via CSS, not in the string)', () => {
    function renderHighlighted(minutesUntilStart: number): void {
      render(
        <ClassRow
          subjectName="Sistemas Operativos"
          subjectColor="#4c8dff"
          startMinutes={480}
          endMinutes={570}
          location="Aula 204"
          minutesUntilStart={minutesUntilStart}
        />
      )
    }

    it('under an hour away, renders the minutes pill and the violet accent border', () => {
      renderHighlighted(45)

      const pill = screen.getByText('En 45 min')
      expect(pill).toHaveClass('uppercase', 'rounded-full', 'bg-violet-soft', 'text-violet-ink')
      expect(screen.getByText('Sistemas Operativos').closest('div')).toHaveClass('border-violet')
    })

    it('an hour or more away, renders hours and minutes', () => {
      renderHighlighted(80)
      expect(screen.getByText('En 1 h 20 min')).toBeInTheDocument()
    })

    it('a whole-hour wait drops the dangling "0 min"', () => {
      renderHighlighted(120)
      expect(screen.getByText('En 2 h')).toBeInTheDocument()
    })

    it('in progress (zero or negative minutes), reads "Ahora"', () => {
      renderHighlighted(-30)
      expect(screen.getByText('Ahora')).toBeInTheDocument()
    })

    it('renders no pill and keeps the surface border when it is not the next class', () => {
      render(
        <ClassRow
          subjectName="Sistemas Operativos"
          subjectColor="#4c8dff"
          startMinutes={480}
          endMinutes={570}
          location="Aula 204"
        />
      )

      expect(screen.queryByText(/^En /)).not.toBeInTheDocument()
      expect(screen.queryByText('Ahora')).not.toBeInTheDocument()
      expect(screen.getByText('Sistemas Operativos').closest('div')).toHaveClass('border-border')
    })
  })
})
