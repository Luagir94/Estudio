// Presentational (design §4, node `OHnez`): the period timeline.
//
// This is the one view where the model's central rule becomes visible — an
// "Anual 2026" bar physically spanning both cuatrimestre bars is what
// "periods are allowed to overlap" looks like. All the maths lives in
// carreras/domain/timeline.ts; this only paints percentages.
import { formatPeriodRange, isOpenEnded, periodStatus, type PeriodStatus } from '../domain/period'
import { barPosition, markerPosition, timelineScale } from '../domain/timeline'
import type { PeriodRecord } from '../../../shared/ipc/carreras'

interface PeriodTimelineProps {
  periods: PeriodRecord[]
  now: Date
}

const BAR_STYLES: Record<PeriodStatus, string> = {
  activo: 'bg-primary text-primary-foreground',
  finalizado: 'border border-border bg-muted text-muted-foreground',
  proximo: 'border border-primary bg-sidebar-accent text-secondary-foreground'
}

const LEGEND: { status: PeriodStatus; label: string; dot: string }[] = [
  { status: 'finalizado', label: 'Finalizado', dot: 'bg-muted-foreground' },
  { status: 'activo', label: 'Activo', dot: 'bg-primary' },
  { status: 'proximo', label: 'Próximo', dot: 'bg-secondary-foreground' }
]

export function PeriodTimeline({ periods, now }: PeriodTimelineProps): React.JSX.Element | null {
  const scale = timelineScale(periods, now)
  if (scale === null) {
    return null
  }

  const today = markerPosition(now, scale)

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-label font-semibold text-muted-foreground">LÍNEA DE TIEMPO</h2>
        <ul className="flex items-center gap-4">
          {LEGEND.map((entry) => (
            <li key={entry.status} className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${entry.dot}`} />
              {/* Legend entries are sentence-case words, not headings — 11/0
                  (`caption`), never the 0.3 tracking of a field label. */}
              <span className="text-caption font-medium text-muted-foreground">{entry.label}</span>
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
              <span className="text-micro font-semibold whitespace-nowrap text-destructive">hoy</span>
              <span aria-hidden="true" className="h-2 w-0.5 rounded-sm bg-destructive" />
            </span>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {periods.map((period) => {
          const status = periodStatus(period, now)
          const { left, width } = barPosition(period, scale)
          return (
            <li key={period.id} className="flex items-center gap-3">
              <span
                className={
                  status === 'finalizado'
                    ? 'w-40 shrink-0 truncate text-body-sm font-medium text-muted-foreground'
                    : 'w-40 shrink-0 truncate text-body-sm font-semibold text-foreground'
                }
              >
                {period.name}
              </span>
              <div className="relative h-[26px] flex-1">
                <span
                  style={{ left: `${left}%`, width: `${width}%` }}
                  className={`absolute inset-y-0 flex items-center overflow-hidden rounded-md px-3 text-caption font-semibold ${BAR_STYLES[status]}`}
                >
                  <span className="truncate">
                    {isOpenEnded(period) ? 'No termina' : formatPeriodRange(period.startsOn, period.endsOn)}
                  </span>
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
