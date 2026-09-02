// @vitest-environment jsdom
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TimelineMarkerRecord } from '../../../shared/ipc/carreras'
import { TimelineMarkerChip } from './TimelineMarkerChip'

function marker(overrides: Partial<TimelineMarkerRecord> = {}): TimelineMarkerRecord {
  return {
    kind: 'parcial',
    id: 1,
    subjectId: 10,
    periodId: 100,
    subjectName: 'Física I',
    label: 'Parcial 1',
    date: '2026-09-10',
    ...overrides
  }
}

function renderChip(markerRecord: TimelineMarkerRecord, onOpenSubject?: (subjectId: number) => void) {
  const trackRef = createRef<HTMLDivElement>()
  const utils = render(
    <div ref={trackRef} style={{ position: 'relative' }}>
      <TimelineMarkerChip marker={markerRecord} left={50} trackRef={trackRef} onOpenSubject={onOpenSubject} />
    </div>
  )
  return { ...utils, trackRef }
}

describe('TimelineMarkerChip', () => {
  it('renders a button whose accessible name carries kind, label, subject and date', () => {
    renderChip(marker(), vi.fn())

    const chip = screen.getByTestId('timeline-marker')
    expect(chip.tagName).toBe('BUTTON')
    expect(chip).toHaveAttribute('data-kind', 'parcial')
    expect(chip).toHaveAccessibleName('Parcial · Parcial 1 · Física I · 10 sep')
  })

  it('shows the tooltip on hover and hides it again on mouse leave', async () => {
    const user = userEvent.setup()
    renderChip(marker(), vi.fn())

    expect(screen.queryByTestId('timeline-marker-tooltip')).not.toBeInTheDocument()

    await user.hover(screen.getByTestId('timeline-marker'))
    expect(screen.getByTestId('timeline-marker-tooltip')).toBeInTheDocument()

    await user.unhover(screen.getByTestId('timeline-marker'))
    expect(screen.queryByTestId('timeline-marker-tooltip')).not.toBeInTheDocument()
  })

  it('shows the tooltip on focus and hides it on Escape', async () => {
    const user = userEvent.setup()
    renderChip(marker(), vi.fn())

    await user.tab()
    expect(screen.getByTestId('timeline-marker-tooltip')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('timeline-marker-tooltip')).not.toBeInTheDocument()
  })

  it('calls onOpenSubject with the subject id on click', async () => {
    const user = userEvent.setup()
    const onOpenSubject = vi.fn()
    renderChip(marker({ subjectId: 42 }), onOpenSubject)

    await user.click(screen.getByTestId('timeline-marker'))

    expect(onOpenSubject).toHaveBeenCalledWith(42)
  })

  it('calls onOpenSubject with the subject id on Enter', async () => {
    const user = userEvent.setup()
    const onOpenSubject = vi.fn()
    renderChip(marker({ subjectId: 42 }), onOpenSubject)

    await user.tab()
    await user.keyboard('{Enter}')

    expect(onOpenSubject).toHaveBeenCalledWith(42)
  })

  it('renders a non-interactive span with the same accessible name when onOpenSubject is undefined', () => {
    renderChip(marker(), undefined)

    const chip = screen.getByTestId('timeline-marker')
    expect(chip.tagName).toBe('SPAN')
    expect(chip).toHaveAccessibleName('Parcial · Parcial 1 · Física I · 10 sep')
  })
})
