// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AttendanceStatus } from '../../../shared/ipc/materias'
import { ClassRow } from './ClassRow'

interface RowOverrides {
  subjectName?: string
  subjectColor?: string
  startMinutes?: number
  endMinutes?: number
  location?: string | null
  minutesUntilStart?: number | null
  attendanceStatus?: AttendanceStatus | null
  hasNote?: boolean
  onMarkAttendance?: (status: AttendanceStatus | null) => void
  onOpenApunte?: () => void
}

function renderRow(overrides: RowOverrides = {}) {
  const onMarkAttendance = overrides.onMarkAttendance ?? vi.fn()
  const onOpenApunte = overrides.onOpenApunte ?? vi.fn()
  render(
    <ClassRow
      subjectName={overrides.subjectName ?? 'Sistemas Operativos'}
      subjectColor={overrides.subjectColor ?? '#4c8dff'}
      startMinutes={overrides.startMinutes ?? 480}
      endMinutes={overrides.endMinutes ?? 570}
      location={overrides.location === undefined ? 'Aula 204' : overrides.location}
      minutesUntilStart={overrides.minutesUntilStart ?? null}
      attendanceStatus={overrides.attendanceStatus ?? null}
      hasNote={overrides.hasNote ?? false}
      onMarkAttendance={onMarkAttendance}
      onOpenApunte={onOpenApunte}
    />
  )
  return { onMarkAttendance, onOpenApunte }
}

describe('ClassRow (design node G07yA)', () => {
  it('renders subject name, time range, and room', () => {
    renderRow()

    expect(screen.getByText('Sistemas Operativos')).toBeInTheDocument()
    expect(screen.getByText('08:00')).toBeInTheDocument()
    expect(screen.getByText('09:30')).toBeInTheDocument()
    expect(screen.getByText('Aula 204')).toBeInTheDocument()
  })

  it('renders without a room when location is null, never a stray empty node', () => {
    renderRow({ subjectName: 'Bases de Datos', location: null })

    expect(screen.getByText('Bases de Datos')).toBeInTheDocument()
    expect(screen.queryByText('null')).not.toBeInTheDocument()
  })

  describe('next-class highlight (brand accent border + "starts in" pill; uppercase via CSS, not in the string)', () => {
    it('under an hour away, renders the minutes pill and the brand accent border', () => {
      renderRow({ minutesUntilStart: 45 })

      const pill = screen.getByText('En 45 min')
      expect(pill).toHaveClass('uppercase', 'rounded-full', 'bg-brand-soft', 'text-brand-ink')
      expect(screen.getByText('Sistemas Operativos').closest('div')).toHaveClass('border-brand')
    })

    it('an hour or more away, renders hours and minutes', () => {
      renderRow({ minutesUntilStart: 80 })
      expect(screen.getByText('En 1 h 20 min')).toBeInTheDocument()
    })

    it('a whole-hour wait drops the dangling "0 min"', () => {
      renderRow({ minutesUntilStart: 120 })
      expect(screen.getByText('En 2 h')).toBeInTheDocument()
    })

    it('in progress (zero or negative minutes), reads "Ahora"', () => {
      renderRow({ minutesUntilStart: -30 })
      expect(screen.getByText('Ahora')).toBeInTheDocument()
    })

    it('renders no pill and keeps the surface border when it is not the next class', () => {
      renderRow()

      expect(screen.queryByText(/^En /)).not.toBeInTheDocument()
      expect(screen.queryByText('Ahora')).not.toBeInTheDocument()
      expect(screen.getByText('Sistemas Operativos').closest('div')).toHaveClass('border-border')
    })
  })

  describe('class marks', () => {
    // The a11y regression this feature was warned about: a `<label>` wrapping
    // a group of buttons hijacks the accessible name of the FIRST one,
    // because a `<button>` is a labelable element. The group is a
    // fieldset/legend, so all three names survive.
    it('gives all three controls their own accessible name', () => {
      renderRow()

      expect(screen.getByRole('button', { name: 'Marcar presente en Sistemas Operativos' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Marcar ausente en Sistemas Operativos' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Apunte de la clase de Sistemas Operativos' })).toBeInTheDocument()
    })

    it('renders every control unpressed and on the sunken surface while the class is unmarked', () => {
      renderRow()

      const presente = screen.getByRole('button', { name: 'Marcar presente en Sistemas Operativos' })
      const ausente = screen.getByRole('button', { name: 'Marcar ausente en Sistemas Operativos' })
      const apunte = screen.getByRole('button', { name: 'Apunte de la clase de Sistemas Operativos' })

      expect(presente).toHaveAttribute('aria-pressed', 'false')
      expect(ausente).toHaveAttribute('aria-pressed', 'false')
      for (const control of [presente, ausente, apunte]) {
        expect(control).toHaveClass('bg-muted', 'text-secondary-foreground')
      }
    })

    it('paints the presente control in the ok tone when the class is marked presente', () => {
      renderRow({ attendanceStatus: 'presente' })

      const presente = screen.getByRole('button', { name: 'Marcar presente en Sistemas Operativos' })
      expect(presente).toHaveAttribute('aria-pressed', 'true')
      expect(presente).toHaveClass('bg-(--color-ok-soft)', 'text-(--color-ok)')
      expect(screen.getByRole('button', { name: 'Marcar ausente en Sistemas Operativos' })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    })

    it('paints the ausente control in the urgent tone when the class is marked ausente', () => {
      renderRow({ attendanceStatus: 'ausente' })

      const ausente = screen.getByRole('button', { name: 'Marcar ausente en Sistemas Operativos' })
      expect(ausente).toHaveAttribute('aria-pressed', 'true')
      expect(ausente).toHaveClass('bg-(--color-urgent-soft)', 'text-(--color-urgent)')
    })

    // A feriado is not "present" and not "absent" — the row shows neither
    // toggle pressed, and the day is settled from the modal.
    it('leaves both toggles unpressed for a feriado', () => {
      renderRow({ attendanceStatus: 'feriado' })

      expect(screen.getByRole('button', { name: 'Marcar presente en Sistemas Operativos' })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
      expect(screen.getByRole('button', { name: 'Marcar ausente en Sistemas Operativos' })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    })

    it('paints the apunte control in the accent tone when the class already has one', () => {
      renderRow({ hasNote: true })

      expect(screen.getByRole('button', { name: 'Apunte de la clase de Sistemas Operativos' })).toHaveClass(
        'bg-brand-soft',
        'text-primary-ink'
      )
    })

    it('marks an unmarked class presente', async () => {
      const { onMarkAttendance } = renderRow()

      await userEvent.click(screen.getByRole('button', { name: 'Marcar presente en Sistemas Operativos' }))

      expect(onMarkAttendance).toHaveBeenCalledWith('presente')
    })

    // The toggle pair's whole contract: clicking the ACTIVE one clears the
    // mark back to unmarked, which is the absence of a row, not a fourth
    // status.
    it('clears the mark when the active control is clicked again', async () => {
      const { onMarkAttendance } = renderRow({ attendanceStatus: 'presente' })

      await userEvent.click(screen.getByRole('button', { name: 'Marcar presente en Sistemas Operativos' }))

      expect(onMarkAttendance).toHaveBeenCalledWith(null)
    })

    it('switches from presente to ausente in one click', async () => {
      const { onMarkAttendance } = renderRow({ attendanceStatus: 'presente' })

      await userEvent.click(screen.getByRole('button', { name: 'Marcar ausente en Sistemas Operativos' }))

      expect(onMarkAttendance).toHaveBeenCalledWith('ausente')
    })

    it('opens the apunte from the notebook control', async () => {
      const { onOpenApunte } = renderRow()

      await userEvent.click(screen.getByRole('button', { name: 'Apunte de la clase de Sistemas Operativos' }))

      expect(onOpenApunte).toHaveBeenCalledTimes(1)
    })
  })
})
