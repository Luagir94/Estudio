// Presentational (design D7-D8, D10-D11): the CLUSTER chip a `PeriodTimeline`
// row places on its track when several upcoming markers land too close
// together to draw separately. The single-marker counterpart lives in
// `TimelineMarkerChip.tsx` — split at the single/cluster seam by owner
// decision (a deviation from design #546's single-combined-file draft;
// design D6 governed the DOMAIN union `TimelineMarkerGroup`, never the
// component file count — see apply-progress for the record). The two are
// genuinely different widgets: this one is a menu-button with a real ARIA
// menu, the single marker is a labelled button with a decorative tooltip.
// This file imports the popover-clamp hook and the row body from
// `TimelineMarkerChip` rather than duplicating them.
//
// Deliberately NOT `ActionMenu` (design D7): that primitive opens below,
// right-aligned, click-only, 200px fixed width. This chip opens upward,
// reacts to hover AND pinning, and sizes to its own fit-content popover.
// Three of `ActionMenu`'s behaviours are copied on purpose rather than
// shared, because sharing them would mean forking the two triggers' opening
// rules anyway: Escape closes and refocuses the trigger, an outside
// pointerdown closes, and choosing a row closes before it acts.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { markerKey } from '../domain/timelineMarkers'
import type { TimelineMarkerRecord } from '../../../shared/ipc/carreras'
import { cn } from '../../shared/lib/cn'
import { interactive } from '../../shared/lib/interactive'
import { MarkerRowContent, usePopoverClamp } from './TimelineMarkerChip'

interface TimelineMarkerClusterProps {
  markers: TimelineMarkerRecord[]
  /** Percentage from the left edge of the track (from `layoutPeriodMarkers`). */
  left: number
  /** The owning row's track — the positioning context the popover clamps against. */
  trackRef: RefObject<HTMLDivElement | null>
  /** Undefined when the caller has no navigation to offer; rows degrade to inert text. */
  onOpenSubject?: (subjectId: number) => void
}

const POPOVER_SURFACE =
  'absolute bottom-[calc(100%+8px)] left-0 z-20 rounded-lg border border-border bg-popover shadow-[0_4px_16px_rgba(0,0,0,0.45)]'

// The vertical offset belongs on the positioned element, not on the chip
// inside it: a `top-*` utility is silently inert on a statically positioned
// button, and the chip then baseline-aligns inside this wrapper's line box
// instead. `flex` keeps the wrapper exactly as tall as the chip, so the
// popover's `bottom: 100% + 8px` still measures from the chip's top edge.
const ANCHOR = 'absolute top-[18px] flex -translate-x-1/2'

export function TimelineMarkerCluster({
  markers,
  left,
  trackRef,
  onOpenSubject
}: TimelineMarkerClusterProps): React.JSX.Element {
  const { t } = useTranslation('carreras')
  // Two INDEPENDENT reasons to be open, not one boolean (design: "pointer
  // enter opens, pointer leaving chip+popover closes" AND "click/Enter/Space
  // toggles" are two different triggers, not one). `hovered` tracks the
  // pointer; `pinned` tracks an explicit activation. The popover is visible
  // whenever EITHER is true, so a click while already hovering still shows
  // it — unpinning does not hide a popover the pointer is still resting on.
  // `aria-expanded` reflects `pinned` ONLY: a hover preview is not an
  // expanded menu, and announcing it as one would lie to assistive tech.
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const isOpen = hovered || pinned
  const containerRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()
  const clusterLabel = t('periodTimeline.markerCluster', { count: markers.length })
  usePopoverClamp(isOpen, left, trackRef, popoverRef)

  /** A full, explicit dismissal — clears BOTH reasons, not just the pinned one. */
  function close(): void {
    setHovered(false)
    setPinned(false)
  }

  useEffect(() => {
    if (!isOpen) {
      return
    }
    function handlePointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  function focusRow(index: number): void {
    const count = markers.length
    rowRefs.current[((index % count) + count) % count]?.focus()
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusRow(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusRow(index - 1)
    } else if (event.key === 'Escape') {
      close()
      chipRef.current?.focus()
    } else if (event.key === 'Tab') {
      close()
    }
  }

  return (
    <div
      ref={containerRef}
      className={ANCHOR}
      style={{ left: `${left}%` }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        ref={chipRef}
        type="button"
        data-testid="timeline-marker-cluster"
        data-period-id={markers[0]!.periodId}
        aria-label={clusterLabel}
        aria-haspopup="menu"
        aria-expanded={pinned}
        aria-controls={pinned ? menuId : undefined}
        onClick={() => {
          // Native button semantics already fire this `click` for a mouse
          // click AND for Enter/Space while focused, so pinning and the
          // keyboard-only "focus the first row" behaviour both funnel
          // through one place. This toggles `pinned` ONLY, never `hovered` —
          // a second click while the pointer still rests on the chip must
          // NOT hide a popover the pointer is still over.
          if (pinned) {
            setPinned(false)
          } else {
            setPinned(true)
            requestAnimationFrame(() => focusRow(0))
          }
        }}
        className={cn(
          'h-4 w-4 rounded-full border border-secondary-foreground bg-card text-[9px] font-bold text-foreground',
          interactive
        )}
      >
        {markers.length}
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          id={menuId}
          data-testid="timeline-marker-popover"
          role="menu"
          aria-label={clusterLabel}
          className={cn(POPOVER_SURFACE, 'flex flex-col gap-1.5 px-2.5 py-2 whitespace-nowrap')}
        >
          {markers.map((marker, index) =>
            onOpenSubject === undefined ? (
              <li key={markerKey(marker)} className="flex items-center gap-2 text-[11px]">
                <MarkerRowContent t={t} marker={marker} />
              </li>
            ) : (
              <button
                key={markerKey(marker)}
                ref={(node) => {
                  rowRefs.current[index] = node
                }}
                type="button"
                data-testid="timeline-marker-row"
                role="menuitem"
                onKeyDown={(event) => handleRowKeyDown(event, index)}
                onClick={() => {
                  close()
                  onOpenSubject(marker.subjectId)
                }}
                className={cn('flex items-center gap-2 text-left text-[11px]', interactive)}
              >
                <MarkerRowContent t={t} marker={marker} />
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
