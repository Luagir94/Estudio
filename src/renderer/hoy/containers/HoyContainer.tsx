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
import { classifyDeadline } from '../../entregas/domain/deadline'
import { toMondayFirstIndex } from '../../shared/domain/dayOfWeek'
import { hoyApi } from '../adapters/hoyApi'
import { HoyDashboard } from '../components/HoyDashboard'
import { getDashboardDeadlines, getFreeBlocks, getTodayClasses, getWeekStrip } from '../domain/dashboard'

interface HoyContainerProps {
  /** Injection point for deterministic "today" composition in tests. Defaults to the real clock. */
  now?: Date
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1)
}

export function HoyContainer({ now = new Date() }: HoyContainerProps = {}): React.JSX.Element {
  const { data, isLoading, isError } = useQuery({ queryKey: ['hoy', 'dashboard'], queryFn: hoyApi.dashboard })

  const subjects = data?.subjects ?? []
  const allDeadlines = data?.deadlines ?? []

  const todayClasses = getTodayClasses(subjects, now)
  const freeBlocks = getFreeBlocks(todayClasses)
  const dashboardDeadlines = getDashboardDeadlines(allDeadlines, now)
  const weekStrip = getWeekStrip(subjects, allDeadlines, now)
  const todayMondayFirstIndex = toMondayFirstIndex(now.getDay())

  const overdueCount = allDeadlines.filter(
    (deadline) => classifyDeadline(deadline.dueAt, deadline.done, now) === 'atrasadas'
  ).length
  const upcoming7Count = dashboardDeadlines.length - overdueCount

  const dateHeadline = capitalize(format(now, "EEEE d 'de' MMMM", { locale: es }))
  const daySummary = `${todayClasses.length} ${pluralize(todayClasses.length, 'clase', 'clases')} hoy · ${overdueCount} ${pluralize(overdueCount, 'atrasada', 'atrasadas')} · ${upcoming7Count} ${pluralize(upcoming7Count, 'entrega', 'entregas')} en los próximos 7 días`

  return (
    <div className="flex flex-col gap-6">
      {isLoading && <p className="text-body-lg text-muted-foreground">Cargando…</p>}
      {isError && <p className="text-body-lg text-destructive">No se pudo cargar el resumen de hoy.</p>}
      {data && (
        <HoyDashboard
          dateHeadline={dateHeadline}
          daySummary={daySummary}
          todayClasses={todayClasses}
          freeBlocks={freeBlocks}
          deadlines={dashboardDeadlines}
          weekStrip={weekStrip}
          todayMondayFirstIndex={todayMondayFirstIndex}
          now={now}
        />
      )}
    </div>
  )
}
