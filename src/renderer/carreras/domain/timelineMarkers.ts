import { format } from 'date-fns'
import type { TimelineMarkerKind, TimelineMarkerRecord } from '../../../shared/ipc/carreras'
import { clampedMarkerPosition, type TimelineScale } from './timeline'

// Pure, framework-free domain module (design §4). MUST NOT import electron
// or better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule. Only `date-fns` and the shared IPC
// TYPES ride along, same as `timeline.ts` and `activeTerms.ts` already do.
//
// Everything a "now"-dependent timeline rule needs, kept out of the wire
// projection (`sqliteProgramRepository.ts`) on purpose: the payload states
// facts, this module decides what "upcoming" and "nearby" mean for those
// facts at render time.

/** Legend order and the tie-break order used by `compareTimelineMarkers`. */
export const TIMELINE_MARKER_KINDS: readonly TimelineMarkerKind[] = ['parcial', 'final', 'entrega']

/**
 * Percent of the track width within which two markers collapse into one
 * cluster chip (design D5). 2.5% of a 756px pen track is ~18.9px, comfortably
 * above a 16px hovered chip plus a 2px gap.
 */
export const CLUSTER_THRESHOLD_PERCENT = 2.5

/** `id` alone collides across kinds (a parcial and a final can share one). */
export function markerKey(marker: Pick<TimelineMarkerRecord, 'kind' | 'id'>): string {
  return `${marker.kind}-${marker.id}`
}

/**
 * Whether a marker's date has not yet passed, compared against an injected
 * clock (never `new Date()` inside domain code) so the caller controls "now"
 * and the same payload renders correctly across a day rollover without a
 * refetch. Local-day comparison, same reasoning as `timeline.ts`'s
 * `toIsoDate`: reading `today` as UTC would shift it a day in any timezone
 * west of Greenwich.
 */
export function isUpcomingMarker(marker: Pick<TimelineMarkerRecord, 'date'>, today: Date): boolean {
  return marker.date >= format(today, 'yyyy-MM-dd')
}

/**
 * The canonical order for markers everywhere they need one: sorting before
 * clustering, and re-sorting a cluster's popover rows so they read
 * chronologically even though the cluster itself was built by position.
 * Date ascending, then `TIMELINE_MARKER_KINDS` index, then subject name,
 * then id — each step only breaking the previous step's tie.
 */
export function compareTimelineMarkers(a: TimelineMarkerRecord, b: TimelineMarkerRecord): number {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1
  }
  const kindDelta = TIMELINE_MARKER_KINDS.indexOf(a.kind) - TIMELINE_MARKER_KINDS.indexOf(b.kind)
  if (kindDelta !== 0) {
    return kindDelta
  }
  const nameDelta = a.subjectName.localeCompare(b.subjectName)
  if (nameDelta !== 0) {
    return nameDelta
  }
  return a.id - b.id
}

/** A marker already placed on its track, before clustering decides its final chip. */
export interface PositionedTimelineMarker {
  marker: TimelineMarkerRecord
  /** Percentage from the left edge of the track, from `clampedMarkerPosition`. */
  left: number
}

/**
 * What a chip renders. A one-element cluster is unrepresentable BY
 * CONSTRUCTION (design D6): `groupNearbyMarkers` only ever emits `'single'`
 * for a lone marker, never a `'cluster'` with one member.
 */
export type TimelineMarkerGroup =
  | { type: 'single'; left: number; marker: TimelineMarkerRecord }
  | { type: 'cluster'; left: number; markers: TimelineMarkerRecord[] }

/**
 * Collapses markers that land within `thresholdPercent` of each other into
 * one cluster chip (design D5).
 *
 * SINGLE-LINKAGE, not anchor-to-first-member: each candidate is compared to
 * the LAST member appended to the currently open group, never to the
 * group's first member. Anchor-to-first can leave two adjacent groups
 * closer together than the threshold — e.g. items at 0, 2.4, 2.6 with a
 * 2.5 threshold: comparing 2.6 to the anchor (0) sees 2.6 > 2.5 and splits
 * off a lone group at 2.6, whose centroid sits only 1.4 from the first
 * group's centroid (1.2) — inside the threshold that "adjacent groups"
 * exists to guarantee. Comparing 2.6 to the last appended member (2.4,
 * diff 0.2) correctly chains all three into one cluster instead.
 */
export function groupNearbyMarkers(
  positioned: PositionedTimelineMarker[],
  thresholdPercent = CLUSTER_THRESHOLD_PERCENT
): TimelineMarkerGroup[] {
  if (positioned.length === 0) {
    return []
  }

  const sorted = [...positioned].sort((a, b) => a.left - b.left || compareTimelineMarkers(a.marker, b.marker))

  const openGroups: PositionedTimelineMarker[][] = [[sorted[0]!]]
  for (let i = 1; i < sorted.length; i += 1) {
    const item = sorted[i]!
    const currentGroup = openGroups[openGroups.length - 1]!
    const lastAppended = currentGroup[currentGroup.length - 1]!
    if (thresholdPercent > 0 && item.left - lastAppended.left <= thresholdPercent) {
      currentGroup.push(item)
    } else {
      openGroups.push([item])
    }
  }

  return openGroups.map((group) => {
    if (group.length === 1) {
      return { type: 'single', left: group[0]!.left, marker: group[0]!.marker }
    }
    const left = group.reduce((sum, item) => sum + item.left, 0) / group.length
    const markers = group.map((item) => item.marker).sort(compareTimelineMarkers)
    return { type: 'cluster', left, markers }
  })
}

/**
 * The one call `PeriodTimeline` makes per period row: narrow `markers` to
 * this period, drop everything that already passed, place what remains on
 * the track, and cluster whatever ends up close together.
 */
export function layoutPeriodMarkers(
  markers: TimelineMarkerRecord[],
  periodId: number,
  scale: TimelineScale,
  today: Date
): TimelineMarkerGroup[] {
  const positioned = markers
    .filter((marker) => marker.periodId === periodId && isUpcomingMarker(marker, today))
    .map((marker) => ({ marker, left: clampedMarkerPosition(marker.date, scale) }))

  return groupNearbyMarkers(positioned)
}

/**
 * Horizontal offset (px, from the track's left edge) for a popover anchored
 * at `anchorPx`, so a `popoverWidth`-wide popover never overflows a track
 * `trackWidth` wide (design D10). Centers on the anchor when there is room,
 * then clamps into `[0, trackWidth - popoverWidth]`; a popover wider than
 * the track clamps fully to the left edge (`0`) rather than partially
 * overflowing, because a fit-content popover's width is dictated by its
 * rows and is never shrunk to fit. Pen-verified against the approved
 * cluster popover: `clampPopoverLeft(640, 261, 756) === 495`.
 */
export function clampPopoverLeft(anchorPx: number, popoverWidth: number, trackWidth: number): number {
  const centered = anchorPx - popoverWidth / 2
  return Math.min(Math.max(centered, 0), Math.max(trackWidth - popoverWidth, 0))
}
