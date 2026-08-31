// Presentational (design node `sQ7Td`/`U2l61`, verified via the Pencil MCP
// tools): the Horario weekly grid — all SEVEN days, Monday-first. SlotEditor
// offers Sábado and Domingo, so a five-column grid silently hid slots that
// had been saved and were visible on the subject detail screen; the .pen
// design was updated to carry the weekend columns too.
// No data fetching, no IPC — that lives in HorarioContainer.
// A block carries exactly ONE target: the BODY marks asistencia (feriado
// included — Hoy's row only offers presente/ausente), which is the one thing
// no other screen can reach for a class that is not today.
//
// Editing the horario itself is deliberately NOT one of them. It is already a
// click away from the materia ("Editar materia"), so a shortcut here was a
// duplicate. Neither is the apunte: the .pen block carries a name and an hour
// range and nothing else, and on a three-lane column a second control eats the
// ~60px the subject name needs. An apunte is written from Hoy's ClassRow or
// from the subject's APUNTES tab.
import { useTranslation } from 'react-i18next'
import { getNowOffsetFraction, hasWeekendClasses, layoutDaySlots } from '../domain/weekProjection'
import type { WeekDayColumn, WeekProjectionSlot } from '../domain/weekProjection'
import { cn } from '../../shared/lib/cn'
import { interactive } from '../../shared/lib/interactive'
import { subjectColorForScheme } from '../../shared/lib/subjectColorScheme'
import { usePrefersLightScheme } from '../../shared/lib/usePrefersLightScheme'

// The grid spans 08:00..24:00 in eight 2-hour rows — the design's original
// 20:00 cut-off pushed evening classes outside the body. Heights are relative,
// not the design's fixed 68px rows: the grid takes whatever height the screen
// gives it and blocks are placed as a percentage of the window, so an evening
// class gets the same room as a morning one on any window.
// MIN_HEIGHT_PX keeps it readable on short windows (the main region scrolls
// past that point).
const GRID_START_MINUTES = 480 // 08:00
const GRID_END_MINUTES = 1440 // 24:00
const GRID_TOTAL_MINUTES = GRID_END_MINUTES - GRID_START_MINUTES
const HOUR_MARKS = [480, 600, 720, 840, 960, 1080, 1200, 1320] // 08:00..22:00
const MIN_HEIGHT_PX = 420
// A block scaled below one line of text got its subject name sliced in half by
// `overflow-hidden`. This floor (padding + one line) keeps the name readable:
// the design's 8px padding on both edges plus one 11px line at line-height
// 1.15 (~13px). The previous 26 was computed against the old 4px vertical
// padding and would clip the name again now that the design's 8 is restored.
const BLOCK_MIN_HEIGHT_PX = 30
// The design leaves the grid short of the viewport bottom (a fixed 476px body
// on an 800px screen). The body here stretches instead — see the comment
// above — so that slack has to be paid back explicitly, or the last row sits
// flush against the window edge.
const GRID_BOTTOM_SPACE = 'pb-6'
// The horizontal breathing room a block leaves on each side of its column —
// what `inset-x-1` used to hard-code before lanes made the left edge depend
// on how many classes share the hour.
const COLUMN_INSET_PX = 4
// Design's `Overlap Band`: 2px between two lanes, so the seam reads as two
// blocks rather than one wide block with a hairline in it.
const LANE_GAP_PX = 2

/** Position of a minute-of-day within the grid body, as a CSS percentage. */
function percentOf(minutes: number): string {
  return `${((minutes - GRID_START_MINUTES) / GRID_TOTAL_MINUTES) * 100}%`
}

/** Span of a duration within the grid body, as a CSS percentage. */
function percentSpan(minutes: number): string {
  return `${(minutes / GRID_TOTAL_MINUTES) * 100}%`
}

/**
 * Horizontal placement of a block inside its day column. With one lane the
 * result is exactly the old `inset-x-1` (the gap collapses to zero), so a
 * day with no collisions looks untouched; with more, the lanes split the
 * same track evenly and each block keeps the 2px seam the design carries.
 */
function laneStyle(lane: number, laneCount: number): { left: string; width: string } {
  const track = `(100% - ${COLUMN_INSET_PX * 2}px)`
  const gap = laneCount > 1 ? LANE_GAP_PX : 0
  return {
    left: `calc(${COLUMN_INSET_PX}px + ${track} * ${lane} / ${laneCount})`,
    width: `calc(${track} / ${laneCount} - ${gap}px)`
  }
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const mins = (minutes % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

interface DayColumnProps {
  slots: WeekProjectionSlot[]
  isToday: boolean
  /** Empty-weekend column: about a third of a normal track, body dimmed. */
  collapsed: boolean
  /** Where the "now" line sits (0..1 of the grid range), or null — only today's column ever receives a value. */
  nowFraction: number | null
  label: string
  onOpenClase: (slot: WeekProjectionSlot) => void
}

function DayColumn({ slots, isToday, collapsed, nowFraction, label, onOpenClase }: DayColumnProps): React.JSX.Element {
  const { t } = useTranslation('horario')
  // Stored subject colours are the dark palette; inline styles cannot hear
  // the light media query, so the scheme mapping happens here.
  const scheme = usePrefersLightScheme() ? 'light' : 'dark'
  return (
    <div
      role="list"
      aria-label={label}
      data-today={isToday}
      className={cn(
        'relative h-full rounded-lg border',
        // A collapsed weekend track keeps ~1/3 of a normal column's share
        // (flex-basis stays 0%, only the grow factor shrinks) and dims its
        // body — the day still exists, it just stops charging rent.
        collapsed ? 'flex-[0.35] opacity-55' : 'flex-1',
        isToday ? 'border-primary bg-primary/10' : 'border-border bg-card'
      )}
    >
      {nowFraction !== null && (
        // The "now" line rides the SAME percentage scale as the class blocks
        // (getNowOffsetFraction over the grid's minute range == percentOf),
        // so the two can never disagree about where 12:00 is.
        <div
          data-testid="now-indicator"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-brand"
          style={{ top: `${nowFraction * 100}%` }}
        >
          <span className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-brand" />
        </div>
      )}
      {layoutDaySlots(slots).map((slot) => {
        const lane = laneStyle(slot.lane, slot.laneCount)
        return (
          <button
            key={slot.slotId}
            type="button"
            data-testid="horario-class-block"
            onClick={() => onOpenClase(slot)}
            // Three classes at the same hour leave each lane ~60px wide: the
            // name truncates to a few characters and the time drops out
            // entirely. This is the one place that hidden information stays
            // recoverable without opening the subject. `title` is last in the
            // accessible-name cascade, so the button's own text still names it.
            title={t('grid.blockTooltip', {
              subject: slot.subjectName,
              start: formatTime(slot.startMinutes),
              end: formatTime(slot.endMinutes)
            })}
            style={{
              top: percentOf(slot.startMinutes),
              height: percentSpan(slot.endMinutes - slot.startMinutes),
              minHeight: BLOCK_MIN_HEIGHT_PX,
              borderLeftColor: subjectColorForScheme(slot.subjectColor, scheme),
              ...lane
            }}
            // `bg-muted`, not `bg-card`: the day column is already `bg-card`, so
            // a block painted the same had no surface of its own — only the 3px
            // accent told you a class was there. The design carried the same
            // collision (`$surface` on `$surface`) and was corrected to
            // `$surface-sunken`, which is what `bg-muted` maps to.
            //
            // That base is also why this does NOT use `interactiveSurface`:
            // its hover IS `bg-muted`, so the block would stop reacting. Hover
            // takes the next step up the neutral ramp instead and press settles
            // back down, which is the same story `interactiveSurface` tells one
            // rung lower. `hairline` is the raw token there because the
            // semantic layer stops at `muted` — its only name for #272730 is
            // `border`, and a background called `border` would read as a lie.
            className={cn(
              // No `inset-x-1`: the horizontal edges come from `laneStyle`
              // now, because where a block starts depends on how many classes
              // share its hour.
              'absolute flex flex-col overflow-hidden rounded-md border-l-[3px] bg-muted p-2',
              // Padding stays even on all four sides, the way the .pen block
              // carries it: the `pr-6` that used to reserve the corner was
              // room for a control that no longer exists, and keeping it would
              // truncate the subject name against empty space.
              'text-left leading-tight',
              interactive,
              'hover:bg-hairline active:bg-muted'
            )}
          >
            {/* The size container for the rule on the time below, and the reason
            it is a wrapper rather than the button itself: a container query
            resolves against the container's CONTENT box, so querying the
            padded button would mean encoding `p-2` into the threshold twice
            over. This wrapper carries no padding, so its content box IS its
            border box and the number below means exactly what it says. */}
            <div className="flex min-h-0 flex-1 flex-col gap-1 [container-type:size]">
              {/* shrink-0 keeps the name whole: when the block is too short for
              both lines, the time below is what gives way, never the name. */}
              <span className="shrink-0 truncate text-caption font-semibold text-foreground">{slot.subjectName}</span>
              {/* ...and it gives way ENTIRELY. Letting `overflow-hidden` clip it
              sliced the digits in half lengthwise, which reads as a broken
              block rather than a small one. Below both lines' worth of room
              (11px + 10px at leading-tight, plus the 4px gap = 30.25px) the
              time is dropped and the name keeps the block to itself. */}
              {/* ...and the same trade in the OTHER axis, now that a shared
              hour can halve a block's width. `08:00 – 09:00` needs ~62px
              at 10px; under that the time would truncate to a meaningless
              `08:0…`, so the name keeps the lane to itself — which is what
              the design's narrow overlap lanes show. */}
              <span className="truncate text-micro text-muted-foreground [@container(max-height:30px)]:hidden [@container(max-width:64px)]:hidden">
                {t('grid.timeRange', { start: formatTime(slot.startMinutes), end: formatTime(slot.endMinutes) })}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export interface HorarioGridProps {
  /** 7 columns from `projectWeek`, Monday-first — all of them are rendered, weekend included. */
  columns: WeekDayColumn[]
  /** Monday-first index (0..6) of today, or null when today is unknown. */
  todayMondayFirstIndex: number | null
  /** Reference instant for the "now" line in today's column. Defaults to the real clock. */
  now?: Date
  /**
   * Block body: opens the class dialog (asistencia) for that slot. The caller
   * owns the DATE — the grid knows only a weekday, and which calendar day
   * that weekday is depends on the week being looked at.
   */
  onOpenClase: (slot: WeekProjectionSlot) => void
}

export function HorarioGrid({
  columns,
  todayMondayFirstIndex,
  now = new Date(),
  onOpenClase
}: HorarioGridProps): React.JSX.Element {
  const { t } = useTranslation('horario')
  // Monday-first, same order as `columns` (see `projectWeek`).
  const weekdayLabels = t('common:weekdaysLong', { returnObjects: true }) as string[]
  const weekdayCapsLabels = t('common:weekdaysCaps', { returnObjects: true }) as string[]
  const weekdayColumns = columns
  // With NO weekend class at all, Sábado/Domingo collapse to narrow, dimmed
  // tracks (headers abbreviate to SÁB/DOM); one weekend class restores the
  // full seven-column layout. Monday-first indices 5 and 6 ARE the weekend —
  // `projectWeek` guarantees that order.
  const weekendCollapsed = !hasWeekendClasses(columns)
  const isWeekendIndex = (index: number): boolean => index >= 5
  const nowFraction = getNowOffsetFraction(now, GRID_START_MINUTES, GRID_END_MINUTES)

  return (
    // A seven-day week has a width floor: under ~720px the day columns stop
    // being readable, and a day you cannot read is worse than one you have to
    // scroll to. So this is the ONE screen that keeps a horizontal scrollbar —
    // and it keeps it INSIDE the grid (`overflow-x-auto` + `min-w-0`), so the
    // page itself never scrolls sideways and the headline stays put.
    <div className={cn('flex min-w-0 flex-1 overflow-x-auto', GRID_BOTTOM_SPACE)}>
      <div className="flex min-w-[720px] flex-1 flex-col gap-3" style={{ minHeight: MIN_HEIGHT_PX }}>
        <div className="flex shrink-0 gap-2">
          <div className="w-[52px] shrink-0" aria-hidden="true" />
          {weekdayLabels.map((label, index) => (
            <div
              key={label}
              className={cn(
                'text-center text-body-sm font-semibold',
                weekendCollapsed && isWeekendIndex(index) ? 'flex-[0.35]' : 'flex-1',
                index === todayMondayFirstIndex ? 'text-primary-ink' : 'text-secondary-foreground'
              )}
            >
              {weekendCollapsed && isWeekendIndex(index) ? weekdayCapsLabels[index] : label}
            </div>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 gap-2">
          <div className="flex w-[52px] shrink-0 flex-col">
            {HOUR_MARKS.map((minutes) => (
              <span key={minutes} className="flex-1 text-caption font-medium text-muted-foreground">
                {formatTime(minutes)}
              </span>
            ))}
          </div>

          {weekdayColumns.map((column, index) => (
            <DayColumn
              key={column.dayOfWeek}
              slots={column.slots}
              isToday={index === todayMondayFirstIndex}
              collapsed={weekendCollapsed && isWeekendIndex(index)}
              nowFraction={index === todayMondayFirstIndex ? nowFraction : null}
              // The aria-label keeps the FULL day name even when the visual
              // header abbreviates to SÁB/DOM — collapsing is a visual
              // treatment, not a semantic one.
              label={weekdayLabels[index]!}
              onOpenClase={onOpenClase}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
