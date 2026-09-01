// Presentational (approved `.pen`, the right column of node `d3b73F`): what the
// borrador adds up to, beside the plan map.
//
// THE CLASH NOTICE BLOCKS NOTHING. It never removes a box's `×`, never hides a
// materia, and never withholds a `+` from one that would collide. Its own
// approved copy is the specification — "el planificador avisa, no decide" — and
// the planificador's tests already hold that line for the same catalog strings.
import { TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toMondayFirstIndex } from '../../shared/domain/dayOfWeek'
import {
  type DraftSubject,
  findScheduleClashes,
  summarizeWeeklyLoad,
  weeklyLoadFraction
} from '../../planificador/domain/draftSchedule'

interface PlanDraftRailProps {
  /** The materias currently in the borrador for this carrera. */
  draft: readonly DraftSubject[]
}

// A seventh local copy of the same three lines, matching the convention every
// other row component in this app follows. Extracting it is a repo-wide
// consolidation, not this feature's business.
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  return `${hours}:${(minutes % 60).toString().padStart(2, '0')}`
}

/** Number part only — the "{{value}} h" wrapping is the locale's business. */
function formatHoursValue(totalMinutes: number): string {
  const rounded = Math.round((totalMinutes / 60) * 10) / 10
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
}

export function PlanDraftRail({ draft }: PlanDraftRailProps): React.JSX.Element {
  const { t } = useTranslation(['carreras', 'planificador', 'common'])
  const weekdaysLong = t('common:weekdaysLong', { returnObjects: true }) as string[]
  const clashes = findScheduleClashes(draft)
  const load = summarizeWeeklyLoad(draft)

  return (
    <div
      data-testid="plan-draft-rail"
      className="flex w-full flex-col gap-3 min-[820px]:w-[260px] min-[820px]:shrink-0"
    >
      <h2 className="text-label font-semibold text-muted-foreground">{t('carreras:planMap.draftHeading')}</h2>

      {/* `warn`, not `urgent`. A collision is not an error — the student is
          allowed to keep it, and the copy says so. Urgent is this app's colour
          for something that went WRONG, and spending it here would leave
          nothing louder to say when something does. */}
      {clashes.map((clash) => (
        <div
          key={`${clash.first.id}-${clash.second.id}-${clash.dayOfWeek}-${clash.startMinutes}`}
          data-testid="plan-draft-clash"
          className="flex items-start gap-3 rounded-lg border border-(--color-warn) bg-(--color-warn-soft) p-3"
        >
          <TriangleAlert className="h-4 w-4 shrink-0 text-(--color-warn)" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-body-sm font-semibold text-foreground">
              {t('planificador:clash.title', { first: clash.first.name, second: clash.second.name })}
            </span>
            <span className="text-body-sm text-secondary-foreground">
              {t('planificador:clash.body', {
                day: weekdaysLong[toMondayFirstIndex(clash.dayOfWeek)],
                start: formatTime(clash.startMinutes),
                end: formatTime(clash.endMinutes)
              })}
            </span>
          </div>
        </div>
      ))}

      <div data-testid="plan-draft-load" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-overline font-semibold text-muted-foreground">
            {t('planificador:weeklyLoad.heading')}
          </span>
          <span className="text-body-sm font-semibold text-foreground">
            {t('planificador:weeklyLoad.hours', { value: formatHoursValue(load.totalMinutes) })}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            data-testid="plan-draft-load-fill"
            className="h-full rounded-full bg-primary"
            style={{ width: `${weeklyLoadFraction(load.totalMinutes) * 100}%` }}
          />
        </div>
        <span className="text-body-sm text-muted-foreground">
          {t('planificador:weeklyLoad.caption', {
            subjects: t('planificador:weeklyLoad.subjectsCount', { count: load.subjectCount }),
            classes: t('planificador:weeklyLoad.classesCount', { count: load.classCount })
          })}
        </span>
      </div>
    </div>
  )
}
