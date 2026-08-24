// Container (design §4, node `E2pJ95` — Grupo Hoy): owns data fetching
// (TanStack Query, key ['hoy','dashboard']) and composes the pure read-model
// via `hoy/domain/dashboard.ts`. Delegates rendering to the presentational
// HoyDashboard. This screen has NO write affordance (spec: "Hoy MUST be a
// pure read-model") — reuses `shared/domain/dayOfWeek.ts`'s
// `toMondayFirstIndex` and `entregas/domain/deadline.ts`'s
// `classifyDeadline`, never re-derives either.
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { classifyDeadline } from '../../entregas/domain/deadline'
import { toMondayFirstIndex } from '../../shared/domain/dayOfWeek'
import { hoyApi } from '../adapters/hoyApi'
import { HoyDashboard } from '../components/HoyDashboard'
import {
  getDashboardDeadlines,
  getFreeBlocks,
  getNextClassOccurrence,
  getTodayClasses,
  getWeekStrip
} from '../domain/dashboard'

interface HoyContainerProps {
  /** Injection point for deterministic "today" composition in tests. Defaults to the real clock. */
  now?: Date
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1)
}

export function HoyContainer({ now = new Date() }: HoyContainerProps = {}): React.JSX.Element {
  const { t } = useTranslation('hoy')
  const { data, isLoading, isError } = useQuery({ queryKey: ['hoy', 'dashboard'], queryFn: hoyApi.dashboard })

  const subjects = data?.subjects ?? []
  const allDeadlines = data?.deadlines ?? []

  const todayClasses = getTodayClasses(subjects, now)
  const freeBlocks = getFreeBlocks(todayClasses)
  const nextClass = getNextClassOccurrence(subjects, now)
  const dashboardDeadlines = getDashboardDeadlines(allDeadlines, now)
  const weekStrip = getWeekStrip(subjects, allDeadlines, now)
  const todayMondayFirstIndex = toMondayFirstIndex(now.getDay())

  const overdueCount = allDeadlines.filter(
    (deadline) => classifyDeadline(deadline.dueAt, deadline.done, now) === 'atrasadas'
  ).length
  const upcoming7Count = dashboardDeadlines.length - overdueCount

  const dateHeadline = capitalize(format(now, t('container.dateHeadlineFormat'), { locale: es }))
  const daySummary = t('container.daySummary', {
    classes: t('container.classesToday', { count: todayClasses.length }),
    overdue: t('container.overdueCount', { count: overdueCount }),
    upcoming: t('container.upcomingCount', { count: upcoming7Count })
  })

  return (
    <div className="flex flex-col gap-6">
      {isLoading && <p className="text-body-lg text-muted-foreground">{t('container.loading')}</p>}
      {isError && <p className="text-body-lg text-destructive">{t('container.loadError')}</p>}
      {data && (
        <HoyDashboard
          dateHeadline={dateHeadline}
          daySummary={daySummary}
          todayClasses={todayClasses}
          freeBlocks={freeBlocks}
          deadlines={dashboardDeadlines}
          weekStrip={weekStrip}
          todayMondayFirstIndex={todayMondayFirstIndex}
          nextClass={nextClass}
          now={now}
        />
      )}
    </div>
  )
}
