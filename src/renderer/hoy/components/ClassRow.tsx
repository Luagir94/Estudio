// Presentational (design §4, node `G07yA` — ClassRow: Time Block [start/end,
// 15/13px] + Subject Bar [3px, subject color] + Class Info [subject name] +
// Room. Read-only — Hoy has "sin acciones primarias" (design node `VQJO4`'s
// own description), so unlike Horario's class blocks this row has no click
// handler.
//
// Disclosed deviation: the design's "Class Meta" line (e.g. "Teórica",
// "Laboratorio") has no backing field on `schedule_slots` — only
// dayOfWeek/startMinutes/endMinutes/location are persisted. Omitted rather
// than inventing a class-type value (zero new persisted fields). The
// "next class" pill the design hangs on that meta line therefore sits next
// to the subject name instead.
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { cn } from '../../shared/lib/cn'
import { subjectColorForScheme } from '../../shared/lib/subjectColorScheme'
import { usePrefersLightScheme } from '../../shared/lib/usePrefersLightScheme'

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const mins = (minutes % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

/** Pill copy: "Ahora" in progress, minutes under an hour, "h"/"h min" from there up — uppercased by CSS, never in the string. */
function formatStartsIn(t: TFunction, minutesUntilStart: number): string {
  if (minutesUntilStart <= 0) {
    return t('classRow.inProgress')
  }
  const hours = Math.floor(minutesUntilStart / 60)
  const minutes = minutesUntilStart % 60
  if (hours === 0) {
    return t('classRow.startsInMinutes', { minutes })
  }
  return minutes === 0 ? t('classRow.startsInHours', { hours }) : t('classRow.startsInHoursMinutes', { hours, minutes })
}

interface ClassRowProps {
  subjectName: string
  subjectColor: string
  startMinutes: number
  endMinutes: number
  location: string | null
  /**
   * Set only on the day's highlighted "next class" (see
   * `getNextClassHighlight`'s in-progress-first rule): minutes until it
   * starts, 0/negative while in progress. `null`/omitted renders the plain
   * surface row.
   */
  minutesUntilStart?: number | null
}

export function ClassRow({
  subjectName,
  subjectColor,
  startMinutes,
  endMinutes,
  location,
  minutesUntilStart = null
}: ClassRowProps): React.JSX.Element {
  const { t } = useTranslation('hoy')
  // Stored subject colours are the dark palette; inline styles cannot hear
  // the light media query, so the scheme mapping happens here.
  const scheme = usePrefersLightScheme() ? 'light' : 'dark'
  const isNextClass = minutesUntilStart !== null
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border bg-card px-4 py-3',
        // The accent border is the ONLY surface change — the row keeps its
        // card background so the highlight reads as an outline, not a fill.
        isNextClass ? 'border-violet' : 'border-border'
      )}
    >
      <div className="flex w-[52px] shrink-0 flex-col gap-1">
        <span className="text-body-lg font-semibold text-foreground">{formatTime(startMinutes)}</span>
        <span className="text-body-sm text-muted-foreground">{formatTime(endMinutes)}</span>
      </div>

      <span
        aria-hidden="true"
        style={{ backgroundColor: subjectColorForScheme(subjectColor, scheme) }}
        className="h-9 w-[3px] shrink-0 rounded-full"
      />

      <span className="flex flex-1 items-center gap-2">
        <span className="text-body-lg font-semibold text-foreground">{subjectName}</span>
        {isNextClass && (
          // `text-label` is the scale's 10px step WITH its 0.6px uppercase
          // tracking baked in — exactly the pill's spec, no ad-hoc sizing.
          <span className="shrink-0 rounded-full bg-violet-soft px-2 py-0.5 text-label font-semibold uppercase text-violet-ink">
            {formatStartsIn(t, minutesUntilStart)}
          </span>
        )}
      </span>

      {location && <span className="shrink-0 text-body-sm text-secondary-foreground">{location}</span>}
    </div>
  )
}
