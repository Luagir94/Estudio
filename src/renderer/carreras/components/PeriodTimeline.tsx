// Presentational (design §4, node `OHnez`; markers: design D7-D11,
// pen-delta #543): the period timeline.
//
// This is the one view where the model's central rule becomes visible — an
// "Anual 2026" bar physically spanning both cuatrimestre bars is what
// "periods are allowed to overlap" looks like. All the maths lives in
// carreras/domain/timeline.ts; this only paints percentages. The upcoming
// parcial/final/entrega markers are the same story one layer up: all the
// "now"-dependent rules (upcoming cut, clamped position, clustering) live in
// carreras/domain/timelineMarkers.ts, layoutPeriodMarkers is the one call
// this file makes per row, and the single/cluster DISPATCH lives here — the
// two chip components never branch on `TimelineMarkerGroup.type` themselves.
import { useRef } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { formatPeriodRange, isOpenEnded, periodStatus, type PeriodStatus } from '../domain/period'
import { barPosition, markerPosition, timelineScale } from '../domain/timeline'
import {
  layoutPeriodMarkers,
  markerKey,
  TIMELINE_MARKER_KINDS,
  type TimelineMarkerGroup
} from '../domain/timelineMarkers'
import type { PeriodRecord, TimelineMarkerKind, TimelineMarkerRecord } from '../../../shared/ipc/carreras'
import { cn } from '../../shared/lib/cn'
import { TimelineMarkerChip } from './TimelineMarkerChip'
import { TimelineMarkerCluster } from './TimelineMarkerCluster'

interface PeriodTimelineProps {
  periods: PeriodRecord[]
  now: Date
  /** Upcoming parcial/final/entrega markers for this carrera; absent renders exactly as `[]`. */
  markers?: TimelineMarkerRecord[]
  /** Undefined when the caller has no navigation to offer; chips degrade to non-interactive. */
  onOpenSubject?: (subjectId: number) => void
}

const BAR_STYLES: Record<PeriodStatus, string> = {
  activo: 'bg-primary text-primary-foreground',
  finalizado: 'border border-border bg-muted text-muted-foreground',
  proximo: 'border border-primary bg-sidebar-accent text-secondary-foreground'
}

const LEGEND: { status: PeriodStatus; dot: string }[] = [
  { status: 'finalizado', dot: 'bg-muted-foreground' },
  { status: 'activo', dot: 'bg-primary' },
  { status: 'proximo', dot: 'bg-secondary-foreground' }
]

// Kind colour rides only on a single marker's dot — a cluster mixes kinds by
// definition and stays neutral (design D5). Duplicated from
// `TimelineMarkerChip.tsx`'s private `KIND_DOT` on purpose, same call as that
// file's own `POPOVER_SURFACE` duplication: a small class-string constant,
// not shared logic or behaviour.
const MARKER_KIND_DOT: Record<TimelineMarkerKind, string> = {
  parcial: 'bg-warn',
  final: 'bg-urgent',
  entrega: 'bg-ok'
}

interface TimelinePeriodRowProps {
  period: PeriodRecord
  status: PeriodStatus
  left: number
  width: number
  groups: TimelineMarkerGroup[]
  t: TFunction
  onOpenSubject?: (subjectId: number) => void
}

/**
 * One period row, split out from `PeriodTimeline` for the sole reason that
 * its track needs its OWN ref (design D10's popover clamp measures against
 * the owning row's track, not a shared one) — a hook only a per-row
 * component can call.
 */
function TimelinePeriodRow({
  period,
  status,
  left,
  width,
  groups,
  t,
  onOpenSubject
}: TimelinePeriodRowProps): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)

  return (
    <li className="flex items-center gap-3">
      {/* The 160px column is load-bearing — it is what starts every
          bar at the same x, so it stays. The `truncate` that used to
          ride with it does NOT: the design's own `Row Label` is
          `textGrowth: auto` and was never drawn clipped, and this
          timeline is read-only. A name cut here has nowhere to be
          read in full — no row click, no detail view, no second
          rendering. A long name takes a second line instead; the row
          is `items-center`, so the bar stays put beside it. */}
      <span
        className={
          status === 'finalizado'
            ? 'w-40 shrink-0 break-words text-body-sm font-medium text-muted-foreground'
            : 'w-40 shrink-0 break-words text-body-sm font-semibold text-foreground'
        }
      >
        {period.name}
      </span>
      {/* D9: the track only grows to 34px when it has at least one group to
          hold; an eventless row stays exactly at today's 26px, and the bar
          becomes `top-0 h-[26px]` on EVERY row (not `inset-y-0`) so a 34px
          track still holds a 26px bar. Markers are absolute children of the
          TRACK, never of the bar below — the bar keeps `overflow-hidden` and
          would clip them. */}
      <div
        ref={trackRef}
        data-testid="timeline-track"
        className={cn('relative flex-1', groups.length > 0 ? 'h-[34px]' : 'h-[26px]')}
      >
        <span
          style={{ left: `${left}%`, width: `${width}%` }}
          className={`absolute top-0 h-[26px] flex items-center overflow-hidden rounded-md px-3 text-caption font-semibold ${BAR_STYLES[status]}`}
        >
          <span className="truncate">
            {isOpenEnded(period) ? t('period.neverEnds') : formatPeriodRange(period.startsOn, period.endsOn)}
          </span>
        </span>
        {groups.map((group) =>
          group.type === 'single' ? (
            <TimelineMarkerChip
              key={markerKey(group.marker)}
              marker={group.marker}
              left={group.left}
              trackRef={trackRef}
              onOpenSubject={onOpenSubject}
            />
          ) : (
            <TimelineMarkerCluster
              key={markerKey(group.markers[0]!)}
              markers={group.markers}
              left={group.left}
              trackRef={trackRef}
              onOpenSubject={onOpenSubject}
            />
          )
        )}
      </div>
    </li>
  )
}

export function PeriodTimeline({
  periods,
  now,
  markers = [],
  onOpenSubject
}: PeriodTimelineProps): React.JSX.Element | null {
  const { t } = useTranslation('carreras')
  const scale = timelineScale(periods, now)
  if (scale === null) {
    return null
  }

  const today = markerPosition(now, scale)

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-label font-semibold text-muted-foreground">{t('periodTimeline.heading')}</h2>
        <ul className="flex items-center gap-4">
          {LEGEND.map((entry) => (
            <li key={entry.status} className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${entry.dot}`} />
              {/* Legend entries are sentence-case words, not headings — 11/0
                  (`caption`), never the 0.3 tracking of a field label. */}
              <span className="text-caption font-medium text-muted-foreground">
                {t(`periodStatus.${entry.status}`)}
              </span>
            </li>
          ))}
          {/* Event-kind legend (pen-delta #543): a divider then one entry per
              upcoming marker kind, reusing the SAME `periodTimeline.markerKind.*`
              copy the chips' own tooltips read from — one vocabulary, not two. */}
          <li aria-hidden="true">
            <span className="block h-3 w-px bg-border" />
          </li>
          {TIMELINE_MARKER_KINDS.map((kind) => (
            <li key={kind} className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${MARKER_KIND_DOT[kind]}`} />
              <span className="text-caption font-medium text-muted-foreground">
                {t(`periodTimeline.markerKind.${kind}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <span className="w-40 shrink-0" />
        <div className="relative h-4 flex-1 border-b border-border">
          {today !== null && (
            <span
              style={{ left: `${today}%` }}
              className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
            >
              <span className="text-micro font-semibold whitespace-nowrap text-destructive">
                {t('periodTimeline.today')}
              </span>
              <span aria-hidden="true" className="h-2 w-0.5 rounded-sm bg-destructive" />
            </span>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {periods.map((period) => {
          const status = periodStatus(period, now)
          const { left, width } = barPosition(period, scale)
          const groups = layoutPeriodMarkers(markers, period.id, scale, now)
          return (
            <TimelinePeriodRow
              key={period.id}
              period={period}
              status={status}
              left={left}
              width={width}
              groups={groups}
              t={t}
              onOpenSubject={onOpenSubject}
            />
          )
        })}
      </ul>
    </section>
  )
}
