// @vitest-environment jsdom
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { clampPopoverLeft } from '../domain/timelineMarkers'
import type { TimelineMarkerRecord } from '../../../shared/ipc/carreras'
import { TimelineMarkerCluster } from './TimelineMarkerCluster'

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

function clusterMarkers(count: number): TimelineMarkerRecord[] {
  return Array.from({ length: count }, (_, index) =>
    marker({ id: index + 1, kind: index % 2 === 0 ? 'parcial' : 'final', subjectId: 100 + index })
  )
}

function renderCluster(
  markers: TimelineMarkerRecord[],
  onOpenSubject?: (subjectId: number) => void,
  left = 50,
  trackRef = createRef<HTMLDivElement>()
) {
  const utils = render(
    <div ref={trackRef} style={{ position: 'relative' }}>
      <TimelineMarkerCluster markers={markers} left={left} trackRef={trackRef} onOpenSubject={onOpenSubject} />
    </div>
  )
  return { ...utils, trackRef }
}

describe('TimelineMarkerCluster', () => {
  it('renders a cluster button with the count and toggles aria-expanded on click', async () => {
    const user = userEvent.setup()
    renderCluster(clusterMarkers(3), vi.fn())

    const chip = screen.getByTestId('timeline-marker-cluster')
    expect(chip.tagName).toBe('BUTTON')
    expect(chip).toHaveTextContent('3')
    expect(chip).toHaveAttribute('aria-haspopup', 'menu')
    expect(chip).toHaveAttribute('aria-expanded', 'false')

    await user.click(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'true')

    await user.click(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'false')
  })

  it('toggles aria-expanded on Enter and Space', async () => {
    const user = userEvent.setup()
    renderCluster(clusterMarkers(2), vi.fn())

    await user.tab()
    const chip = screen.getByTestId('timeline-marker-cluster')

    await user.keyboard('{Enter}')
    expect(chip).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard(' ')
    expect(chip).toHaveAttribute('aria-expanded', 'false')
  })

  // Two independent reasons to be open (spec: hovering a cluster reveals its
  // rows, same as a single marker's tooltip) — hover alone must open the
  // popover WITHOUT pinning it, and `aria-expanded` must stay `false` for a
  // hover-only preview: it is not an expanded menu, and announcing it as one
  // would lie to assistive tech.
  it('opens the popover on hover alone, without pinning it, and closes again on unhover', async () => {
    const user = userEvent.setup()
    renderCluster(clusterMarkers(2), vi.fn())
    const chip = screen.getByTestId('timeline-marker-cluster')
    expect(screen.queryByTestId('timeline-marker-popover')).not.toBeInTheDocument()

    await user.hover(chip)

    expect(screen.getByTestId('timeline-marker-popover')).toBeInTheDocument()
    expect(chip).toHaveAttribute('aria-expanded', 'false')

    await user.unhover(chip)

    expect(screen.queryByTestId('timeline-marker-popover')).not.toBeInTheDocument()
  })

  // A second click while the pointer still rests on the chip must NOT hide a
  // popover the pointer is still over — it only clears the PINNED reason.
  // `user.click()` itself hovers before it clicks, so this is the real
  // sequence a mouse produces, not a contrived one.
  it('keeps the popover visible after unpinning while the pointer still rests on the chip', async () => {
    const user = userEvent.setup()
    renderCluster(clusterMarkers(2), vi.fn())
    const chip = screen.getByTestId('timeline-marker-cluster')

    await user.click(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'true')

    await user.click(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('timeline-marker-popover')).toBeInTheDocument()

    await user.unhover(chip)
    expect(screen.queryByTestId('timeline-marker-popover')).not.toBeInTheDocument()
  })

  it('renders one menu row per clustered event with its own kind dot, title and date, and clicking one navigates and closes', async () => {
    const user = userEvent.setup()
    const onOpenSubject = vi.fn()
    renderCluster(clusterMarkers(2), onOpenSubject)

    await user.click(screen.getByTestId('timeline-marker-cluster'))

    const popover = screen.getByTestId('timeline-marker-popover')
    expect(popover).toHaveAttribute('role', 'menu')
    const rows = screen.getAllByTestId('timeline-marker-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAttribute('role', 'menuitem')
    expect(rows[0]).toHaveTextContent('Parcial 1 · Física I')
    expect(rows[0]).toHaveTextContent('10 sep')

    await user.click(rows[0]!)

    expect(onOpenSubject).toHaveBeenCalledWith(100)
    expect(screen.queryByTestId('timeline-marker-popover')).not.toBeInTheDocument()
  })

  it('renders inert li rows, still opening the popover, when onOpenSubject is undefined', async () => {
    const user = userEvent.setup()
    const { container } = renderCluster(clusterMarkers(2), undefined)

    await user.click(screen.getByTestId('timeline-marker-cluster'))

    const popover = screen.getByTestId('timeline-marker-popover')
    expect(popover).toBeInTheDocument()
    expect(screen.queryByTestId('timeline-marker-row')).not.toBeInTheDocument()
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  it('moves focus between rows with ArrowDown/ArrowUp, wrapping at the ends', async () => {
    const user = userEvent.setup()
    renderCluster(clusterMarkers(3), vi.fn())

    await user.click(screen.getByTestId('timeline-marker-cluster'))
    const rows = screen.getAllByTestId('timeline-marker-row')
    rows[0]!.focus()

    await user.keyboard('{ArrowDown}')
    expect(rows[1]).toHaveFocus()

    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(rows[0]).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(rows[2]).toHaveFocus()
  })

  it('closes and refocuses the chip on Escape from a row', async () => {
    const user = userEvent.setup()
    renderCluster(clusterMarkers(2), vi.fn())

    const chip = screen.getByTestId('timeline-marker-cluster')
    await user.click(chip)
    screen.getAllByTestId('timeline-marker-row')[0]!.focus()

    await user.keyboard('{Escape}')

    expect(screen.queryByTestId('timeline-marker-popover')).not.toBeInTheDocument()
    expect(chip).toHaveFocus()
  })

  it('closes on Tab leaving the last row', async () => {
    const user = userEvent.setup()
    renderCluster(clusterMarkers(2), vi.fn())

    await user.click(screen.getByTestId('timeline-marker-cluster'))
    screen.getAllByTestId('timeline-marker-row')[1]!.focus()

    await user.keyboard('{Tab}')

    expect(screen.queryByTestId('timeline-marker-popover')).not.toBeInTheDocument()
  })

  it('closes on an outside pointerdown', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <div style={{ position: 'relative' }}>
          <TimelineMarkerCluster markers={clusterMarkers(2)} left={50} trackRef={createRef()} onOpenSubject={vi.fn()} />
        </div>
        <button type="button">outside</button>
      </div>
    )

    await user.click(screen.getByTestId('timeline-marker-cluster'))
    expect(screen.getByTestId('timeline-marker-popover')).toBeInTheDocument()

    await user.click(screen.getByText('outside'))

    expect(screen.queryByTestId('timeline-marker-popover')).not.toBeInTheDocument()
  })

  it('positions the popover using clampPopoverLeft against the measured track and popover widths', async () => {
    const user = userEvent.setup()
    const trackRef = createRef<HTMLDivElement>()
    const leftPercent = (640 / 756) * 100

    renderCluster(clusterMarkers(2), vi.fn(), leftPercent, trackRef)
    vi.spyOn(trackRef.current!, 'getBoundingClientRect').mockReturnValue({ width: 756 } as DOMRect)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(261)

    await user.click(screen.getByTestId('timeline-marker-cluster'))

    const popover = screen.getByTestId('timeline-marker-popover')
    const anchorPx = (756 * leftPercent) / 100
    expect(popover.style.left).toBe(`${clampPopoverLeft(anchorPx, 261, 756) - anchorPx}px`)
  })
})
