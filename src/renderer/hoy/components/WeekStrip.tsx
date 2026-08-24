// Presentational (design §4, node `s3XYac` — Week Strip: 7 Day frames, each
// with a Day Head [abbr + number], stacked Class Bars [one per class,
// subject-colored], and a Due Marker on days with a pending deadline).
// Monday-first (spec: "Week Strip Starts Monday").
import { useTranslation } from 'react-i18next'
import { cn } from '../../shared/lib/cn'
import type { WeekStripDay } from '../domain/dashboard'

interface WeekStripProps {
  /** Exactly 7 entries, Monday-first (see `getWeekStrip`). */
  days: WeekStripDay[]
  /** Monday-first index (0..6) of today, or null when today is unknown. */
  todayMondayFirstIndex: number | null
}

export function WeekStrip({ days, todayMondayFirstIndex }: WeekStripProps): React.JSX.Element {
  const { t } = useTranslation('hoy')
  // Monday-first, matching `mondayFirstIndex` — same indexing the old
  // hardcoded DAY_ABBR table had.
  const dayAbbr = t('common:weekdaysCaps', { returnObjects: true }) as string[]
  return (
    // A grid with `minmax(0,1fr)` tracks, not a flex row: flex items refuse to
    // shrink below their content, so on a narrow window the seven days pushed
    // the page into a horizontal scrollbar instead of getting narrower. The
    // explicit `minmax(0,...)` is the part that matters — plain `grid-cols-7`
    // has the same min-content floor flex does.
    <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2">
      {days.map((day) => {
        const isToday = day.mondayFirstIndex === todayMondayFirstIndex
        return (
          <div
            key={day.mondayFirstIndex}
            className={cn(
              'flex min-w-0 flex-col gap-3 rounded-lg border px-2 py-3 sm:px-3',
              isToday ? 'border-primary bg-primary/10' : 'border-border bg-card'
            )}
          >
            {/* Stacked until there is room to sit side by side: at the
                narrowest window "LUN" and "11" do not fit on one line. Once
                they DO share a line they share a baseline — "LUN" is 10px and
                "11" is 13px, so centring each box would leave the day floating
                above the date. */}
            <div className="flex flex-col items-start lg:flex-row lg:items-baseline lg:justify-between">
              <span className={cn('text-overline font-medium', isToday ? 'text-primary-ink' : 'text-muted-foreground')}>
                {dayAbbr[day.mondayFirstIndex]}
              </span>
              <span className="text-body font-semibold text-foreground">{day.date.getDate()}</span>
            </div>

            <div className="flex flex-col gap-1" aria-hidden={day.classColors.length === 0}>
              {day.classColors.map((color, index) => (
                <span key={index} style={{ backgroundColor: color }} className="h-[5px] w-full shrink-0 rounded-full" />
              ))}
            </div>

            {day.dueCount > 0 && (
              <div className="flex items-center gap-2 text-micro font-medium text-(--color-urgent)">
                <span aria-hidden="true" className="h-[5px] w-[5px] shrink-0 rounded-full bg-(--color-urgent)" />
                {t('weekStrip.dueCount', { count: day.dueCount })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
