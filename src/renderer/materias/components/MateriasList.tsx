// Presentational (design §4, nodes `dw1W7`/`fyX07`, `U8nLud`): a TABLE
// (MATERIA / HORARIO SEMANAL / ESTADO / PENDIENTES). No data fetching, no
// IPC, and no `new Date()` — `now` arrives as a prop because the status of a
// subject depends on the clock, and a component that reads it itself cannot
// be tested against a fixed day.
//
// PENDIENTES counts OPEN deadlines and comes from the payload
// (`pendingDeadlines`) — a plain count, not the rows, because the number is
// all this column ever shows.
import { UserCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../shared/lib/cn'
import { interactiveSurface } from '../../shared/lib/interactive'
import { subjectColorForScheme } from '../../shared/lib/subjectColorScheme'
import { usePrefersLightScheme } from '../../shared/lib/usePrefersLightScheme'
import { toMondayFirstIndex } from '../../shared/domain/dayOfWeek'
import { resolveSubjectStatus } from '../domain/subjectStatus'
import { SubjectStatusBadge } from './SubjectStatusBadge'
import type { ScheduleSlotRecord, SubjectWithStatus } from '../../../shared/ipc/materias'

interface MateriasListProps {
  subjects: SubjectWithStatus[]
  now: Date
  /**
   * Omit when the caller has nowhere to navigate: the rows then render as
   * plain markup instead of buttons that would do nothing on click.
   */
  onSelect?: (id: number) => void
  /** Empty-state copy. Defaults to the filtered-list wording. */
  emptyMessage?: string
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const mins = (minutes % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

// Empty slots are the caller's case (`noSchedule` copy) — this only formats.
function formatScheduleSummary(slots: ScheduleSlotRecord[], dayAbbreviations: string[]): string {
  const uniqueDays = [...new Set(slots.map((slot) => toMondayFirstIndex(slot.dayOfWeek)))].sort((a, b) => a - b)
  const earliestStart = Math.min(...slots.map((slot) => slot.startMinutes))
  return `${uniqueDays.map((day) => dayAbbreviations[day]).join(', ')} · ${formatTime(earliestStart)}`
}

export function MateriasList({ subjects, now, onSelect, emptyMessage }: MateriasListProps): React.JSX.Element {
  const { t } = useTranslation('materias')
  // Stored subject colours are the dark palette; inline styles cannot hear
  // the light media query, so the scheme mapping happens here.
  const scheme = usePrefersLightScheme() ? 'light' : 'dark'
  // Monday-first, same order as `toMondayFirstIndex` produces.
  const dayAbbreviations = t('common:weekdaysShort3', { returnObjects: true }) as string[]

  if (subjects.length === 0) {
    return <p className="text-body-lg text-muted-foreground">{emptyMessage ?? t('materiasList.emptyFiltered')}</p>
  }

  const rowClassName = 'flex w-full items-center gap-4 rounded-lg border border-border bg-card px-4 py-4 text-left'

  return (
    <div className="flex flex-col gap-3">
      {/*
       * The table drops columns as the window narrows instead of scrolling
       * sideways (design: grupo "Responsive", regla `< 820 px`). The order is
       * by how much each column decides "which row do I click": the name and
       * the ESTADO badge survive to the narrowest window, HORARIO SEMANAL is
       * the first to go because the whole Horario screen exists for it.
       *
       * Every hidden cell is hidden in BOTH the header and the row, keyed by
       * the same breakpoint — a header that outlives its column is worse than
       * no header at all.
       */}
      <div className="flex items-center gap-4 px-4">
        <span className="min-w-0 flex-1 text-overline font-semibold text-muted-foreground">
          {t('materiasList.subjectHeader')}
        </span>
        <span className="hidden w-[190px] shrink-0 text-overline font-semibold text-muted-foreground xl:block">
          {t('materiasList.scheduleHeader')}
        </span>
        <span className="hidden w-[150px] shrink-0 text-overline font-semibold text-muted-foreground lg:block">
          {t('materiasList.attendanceHeader')}
        </span>
        <span className="w-[110px] shrink-0 text-overline font-semibold text-muted-foreground sm:w-[150px]">
          {t('materiasList.statusHeader')}
        </span>
        <span className="hidden w-[95px] shrink-0 text-overline font-semibold text-muted-foreground md:block">
          {t('materiasList.pendingHeader')}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {subjects.map((subject) => {
          const row = (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: subjectColorForScheme(subject.color, scheme) }}
                  className="h-8 w-[3px] shrink-0 rounded-sm"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <strong className="truncate text-body-lg font-semibold text-foreground">{subject.name}</strong>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-caption text-muted-foreground">{subject.code}</span>
                    {subject.period ? (
                      <span className="rounded-md border border-border bg-muted px-2 py-px text-micro font-semibold text-secondary-foreground">
                        {subject.period.name}
                      </span>
                    ) : (
                      <span
                        title={t('materiasList.noPeriodTooltip')}
                        className="rounded-md border border-warn bg-warn-soft px-2 py-px text-overline font-semibold text-warn"
                      >
                        {t('materiasList.noPeriodBadge')}
                      </span>
                    )}
                  </span>
                </span>
              </span>

              <span className="hidden w-[190px] shrink-0 text-body-sm text-secondary-foreground xl:block">
                {subject.slots.length === 0
                  ? t('materiasList.noSchedule')
                  : formatScheduleSummary(subject.slots, dayAbbreviations)}
              </span>

              <span className="hidden w-[150px] shrink-0 items-center gap-2 text-body-sm font-medium text-foreground lg:flex">
                <UserCheck className="h-3 w-3 text-secondary-foreground" aria-hidden />
                {subject.attendanceMinPercent !== null
                  ? t('materiasList.attendanceRequired', { percent: subject.attendanceMinPercent })
                  : t('materiasList.attendanceFree')}
              </span>

              <span className="w-[110px] shrink-0 sm:w-[150px]">
                <SubjectStatusBadge
                  status={resolveSubjectStatus(
                    {
                      outcome: subject.outcome,
                      // A subject with no period cannot be "sin cerrar" —
                      // there is no end date to have passed. An open-ended
                      // interval starting today keeps it reading as cursando.
                      period: subject.period ?? { startsOn: '1970-01-01', endsOn: null },
                      finals: subject.finals
                    },
                    now
                  )}
                />
              </span>

              <span
                className={cn(
                  'hidden w-[95px] shrink-0 text-body-sm md:block',
                  subject.pendingDeadlines === 0 ? 'text-muted-foreground' : 'text-secondary-foreground'
                )}
              >
                {subject.pendingDeadlines === 0
                  ? t('materiasList.noPending')
                  : t('materiasList.pendingCount', { count: subject.pendingDeadlines })}
              </span>
            </>
          )

          return (
            <li key={subject.id}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(subject.id)}
                  className={cn(rowClassName, interactiveSurface)}
                >
                  {row}
                </button>
              ) : (
                <div className={rowClassName}>{row}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
