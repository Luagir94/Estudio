// Presentational (design node `sQ7Td`/`U2l61`, verified via the Pencil MCP
// tools): the Horario weekly grid — all SEVEN days, Monday-first. SlotEditor
// offers Sábado and Domingo, so a five-column grid silently hid slots that
// had been saved and were visible on the subject detail screen; the .pen
// design was updated to carry the weekend columns too.
// No data fetching, no IPC — that lives in HorarioContainer.
// Read-only: the only interaction is clicking a class block, which routes
// through the subject (spec: "Editing a class routes through the subject" —
// there is no direct-edit affordance on this screen).
import { useTranslation } from 'react-i18next'
import type { WeekDayColumn, WeekProjectionSlot } from '../domain/weekProjection'
import { cn } from '../../shared/lib/cn'
import { interactive } from '../../shared/lib/interactive'

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

/** Position of a minute-of-day within the grid body, as a CSS percentage. */
function percentOf(minutes: number): string {
  return `${((minutes - GRID_START_MINUTES) / GRID_TOTAL_MINUTES) * 100}%`
}

/** Span of a duration within the grid body, as a CSS percentage. */
function percentSpan(minutes: number): string {
  return `${(minutes / GRID_TOTAL_MINUTES) * 100}%`
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
  label: string
  onSelectClass: (subjectId: number) => void
}

function DayColumn({ slots, isToday, label, onSelectClass }: DayColumnProps): React.JSX.Element {
  const { t } = useTranslation('horario')
  return (
    <div
      role="list"
      aria-label={label}
      data-today={isToday}
      className={cn(
        'relative h-full flex-1 rounded-lg border',
        isToday ? 'border-primary bg-primary/10' : 'border-border bg-card'
      )}
    >
      {slots.map((slot) => (
        <button
          key={slot.slotId}
          type="button"
          onClick={() => onSelectClass(slot.subjectId)}
          style={{
            top: percentOf(slot.startMinutes),
            height: percentSpan(slot.endMinutes - slot.startMinutes),
            minHeight: BLOCK_MIN_HEIGHT_PX,
            borderLeftColor: slot.subjectColor
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
            'absolute inset-x-1 flex flex-col overflow-hidden rounded-md border-l-[3px] bg-muted p-2',
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
            <span className="truncate text-micro text-muted-foreground [@container(max-height:30px)]:hidden">
              {t('grid.timeRange', { start: formatTime(slot.startMinutes), end: formatTime(slot.endMinutes) })}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}

export interface HorarioGridProps {
  /** 7 columns from `projectWeek`, Monday-first — all of them are rendered, weekend included. */
  columns: WeekDayColumn[]
  /** Monday-first index (0..6) of today, or null when today is unknown. */
  todayMondayFirstIndex: number | null
  /** Opens the "Editar materia" modal on its Horario tab (spec: no direct-edit affordance here). */
  onSelectClass: (subjectId: number) => void
}

export function HorarioGrid({ columns, todayMondayFirstIndex, onSelectClass }: HorarioGridProps): React.JSX.Element {
  const { t } = useTranslation('horario')
  // Monday-first, same order as `columns` (see `projectWeek`).
  const weekdayLabels = t('common:weekdaysLong', { returnObjects: true }) as string[]
  const weekdayColumns = columns

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
                'flex-1 text-center text-body-sm font-semibold',
                index === todayMondayFirstIndex ? 'text-primary-ink' : 'text-secondary-foreground'
              )}
            >
              {label}
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
              label={weekdayLabels[index]!}
              onSelectClass={onSelectClass}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
