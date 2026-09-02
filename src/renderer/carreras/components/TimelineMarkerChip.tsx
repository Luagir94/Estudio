// Presentational (design D7-D8, D10): the SINGLE-marker chip a `PeriodTimeline`
// row places on its track for one upcoming parcial/final/entrega. The
// cluster counterpart lives in `TimelineMarkerCluster.tsx` — split at the
// single/cluster seam by owner decision (a deviation from design #546's
// single-combined-file draft; design D6 governed the DOMAIN union
// `TimelineMarkerGroup`, never the component file count — see apply-progress
// for the record). The two are genuinely different widgets: this one is a
// labelled button with a decorative tooltip, the cluster is a menu-button
// with a real ARIA menu. They share only the popover-clamp hook and the
// row/tooltip body, both exported from here by name so the cluster file
// imports them instead of duplicating them.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { formatDay } from '../domain/period'
import { clampPopoverLeft } from '../domain/timelineMarkers'
import type { TimelineMarkerKind, TimelineMarkerRecord } from '../../../shared/ipc/carreras'
import { cn } from '../../shared/lib/cn'
import { interactive } from '../../shared/lib/interactive'

interface TimelineMarkerChipProps {
  marker: TimelineMarkerRecord
  /** Percentage from the left edge of the track (from `layoutPeriodMarkers`). */
  left: number
  /** The owning row's track — the positioning context the popover clamps against. */
  trackRef: RefObject<HTMLDivElement | null>
  /** Undefined when the caller has no navigation to offer; the chip degrades to non-interactive. */
  onOpenSubject?: (subjectId: number) => void
}

// Kind colour rides only on a SINGLE marker's dot — a cluster mixes kinds by
// definition and stays neutral (design D5, pen-delta "load-bearing rules").
const KIND_DOT: Record<TimelineMarkerKind, string> = {
  parcial: 'bg-warn',
  final: 'bg-urgent',
  entrega: 'bg-ok'
}

function markerAccessibleLabel(t: TFunction, marker: TimelineMarkerRecord): string {
  return t('periodTimeline.markerLabel', {
    kind: t(`periodTimeline.markerKind.${marker.kind}`),
    label: marker.label,
    subject: marker.subjectName,
    date: formatDay(marker.date)
  })
}

function markerTitle(t: TFunction, marker: TimelineMarkerRecord): string {
  return t('periodTimeline.markerTitle', { label: marker.label, subject: marker.subjectName })
}

/**
 * Shared horizontal-clamp behaviour (design D10) — EXPORTED so
 * `TimelineMarkerCluster` uses the SAME positioning logic rather than a
 * second copy of it. Once the popover mounts, measure the track and the
 * popover, then shift the popover so it never overflows the track. The pure
 * maths live in `clampPopoverLeft`; this only feeds it real measurements.
 * jsdom reports zero widths, so this is a no-op under test unless a test
 * stubs `getBoundingClientRect`/`offsetWidth`.
 */
export function usePopoverClamp(
  isOpen: boolean,
  left: number,
  trackRef: RefObject<HTMLDivElement | null>,
  popoverRef: RefObject<HTMLDivElement | null>
): void {
  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }
    const track = trackRef.current
    const popover = popoverRef.current
    if (track === null || popover === null) {
      return
    }
    const trackWidth = track.getBoundingClientRect().width
    const popoverWidth = popover.offsetWidth
    const anchorPx = (trackWidth * left) / 100
    popover.style.left = `${clampPopoverLeft(anchorPx, popoverWidth, trackWidth) - anchorPx}px`
  }, [isOpen, left, trackRef, popoverRef])
}

/**
 * One row's body — a kind dot + title + date. EXPORTED so
 * `TimelineMarkerCluster` renders the SAME row shape for its popover rows
 * rather than a second copy of it; this file uses it for the single
 * marker's own tooltip.
 */
export function MarkerRowContent({ t, marker }: { t: TFunction; marker: TimelineMarkerRecord }): React.JSX.Element {
  return (
    <>
      <span aria-hidden="true" className={cn('h-[7px] w-[7px] shrink-0 rounded-full', KIND_DOT[marker.kind])} />
      <span className="font-semibold text-foreground">{markerTitle(t, marker)}</span>
      <span className="font-medium text-muted-foreground">{formatDay(marker.date)}</span>
    </>
  )
}

const POPOVER_SURFACE =
  'absolute bottom-[calc(100%+8px)] left-0 z-20 rounded-lg border border-border bg-popover shadow-[0_4px_16px_rgba(0,0,0,0.45)]'

export function TimelineMarkerChip({
  marker,
  left,
  trackRef,
  onOpenSubject
}: TimelineMarkerChipProps): React.JSX.Element {
  const { t } = useTranslation('carreras')
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const isOpen = (isHovered || isFocused) && !dismissed
  usePopoverClamp(isOpen, left, trackRef, popoverRef)

  const label = markerAccessibleLabel(t, marker)
  const chipSize = isOpen ? 'top-[18px] h-4 w-4' : 'top-[19px] h-[14px] w-[14px]'
  const dotSize = isOpen ? 'h-2.5 w-2.5' : 'h-2 w-2'
  const chipClassName = cn('absolute -translate-x-1/2 rounded-full bg-card', chipSize)
  const dot = <span aria-hidden="true" className={cn('m-auto block rounded-full', dotSize, KIND_DOT[marker.kind])} />

  const tooltip = isOpen && (
    <div
      ref={popoverRef}
      data-testid="timeline-marker-tooltip"
      aria-hidden="true"
      className={cn(POPOVER_SURFACE, 'flex items-center gap-2 px-2.5 py-1.5 text-[11px] whitespace-nowrap')}
    >
      <MarkerRowContent t={t} marker={marker} />
    </div>
  )

  if (onOpenSubject === undefined) {
    return (
      <span
        data-testid="timeline-marker"
        data-kind={marker.kind}
        data-period-id={marker.periodId}
        aria-label={label}
        style={{ left: `${left}%` }}
        className={chipClassName}
      >
        {dot}
        {tooltip}
      </span>
    )
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Escape') {
      setDismissed(true)
    }
  }

  return (
    <button
      type="button"
      data-testid="timeline-marker"
      data-kind={marker.kind}
      data-period-id={marker.periodId}
      aria-label={label}
      style={{ left: `${left}%` }}
      className={cn(chipClassName, interactive)}
      onMouseEnter={() => {
        setIsHovered(true)
        setDismissed(false)
      }}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => {
        setIsFocused(true)
        setDismissed(false)
      }}
      onBlur={() => setIsFocused(false)}
      onKeyDown={handleKeyDown}
      onClick={() => onOpenSubject(marker.subjectId)}
    >
      {dot}
      {tooltip}
    </button>
  )
}
