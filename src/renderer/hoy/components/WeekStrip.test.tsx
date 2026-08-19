// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { WeekStripDay } from '../domain/dashboard'
import { WeekStrip } from './WeekStrip'

function buildDays(): WeekStripDay[] {
  return Array.from({ length: 7 }, (_unused, mondayFirstIndex) => ({
    mondayFirstIndex,
    date: new Date(2026, 7, 10 + mondayFirstIndex),
    classColors: mondayFirstIndex === 3 ? ['#4c8dff', '#2dd4a7'] : [],
    dueCount: mondayFirstIndex === 4 ? 1 : 0
  }))
}

describe('WeekStrip (task 6.2: 7-day strip, Monday-first, spec: "Week Strip Starts Monday")', () => {
  it('renders all 7 day abbreviations, Monday-first', () => {
    render(<WeekStrip days={buildDays()} todayMondayFirstIndex={null} />)

    for (const label of ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('shows a due-count marker only on the day with pending deadlines', () => {
    render(<WeekStrip days={buildDays()} todayMondayFirstIndex={null} />)

    expect(screen.getByText('1 entrega')).toBeInTheDocument()
  })
})
