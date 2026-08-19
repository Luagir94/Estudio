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
})
