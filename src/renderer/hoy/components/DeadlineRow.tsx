// Presentational (design §4, node `AHToB` — DeadlineRow: Date Chip + title +
// Subject Tag + Status Pill). READ-ONLY variant for Hoy — unlike
// `entregas/components/DeadlineRow.tsx`, this row has no checkbox, no click-
// to-edit, and no delete affordance (design node `VQJO4`: Hoy is a
// "read-model... sin acciones primarias"). Reuses `formatDeadlineStatus`
// (never re-derives status text) and the entregas domain's `MONTH_LABELS`.
import { formatDeadlineStatus } from '../../entregas/domain/deadline'
import { MONTH_LABELS } from '../../entregas/components/DeadlineRow'
import { cn } from '../../shared/lib/cn'
import type { DashboardDeadline } from '../domain/dashboard'

interface HoyDeadlineRowProps {
  deadline: DashboardDeadline
  /** Reference instant for the status pill. Defaults to the real clock. */
  now?: Date
}

export function DeadlineRow({ deadline, now = new Date() }: HoyDeadlineRowProps): React.JSX.Element {
  const dueDate = new Date(deadline.dueAt)
  const status = formatDeadlineStatus(deadline.dueAt, deadline.done, now)
  const isOverdue = status.endsWith('de atraso')

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <span className="flex w-11 shrink-0 flex-col items-center gap-1 rounded-lg bg-muted py-2">
        <span className="text-body-lg font-semibold text-foreground">
          {dueDate.getDate().toString().padStart(2, '0')}
        </span>
        <span className="text-overline font-semibold text-muted-foreground">{MONTH_LABELS[dueDate.getMonth()]}</span>
      </span>

      <span className="flex flex-1 flex-col gap-1">
        <span className="text-body-lg font-semibold text-foreground">{deadline.title}</span>
        <span className="flex items-center gap-2 text-body-sm text-secondary-foreground">
          <span
            aria-hidden="true"
            style={{ backgroundColor: deadline.subjectColor }}
            className="h-[7px] w-[7px] shrink-0 rounded-full"
          />
          {deadline.subjectName}
        </span>
      </span>

      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-1 text-caption font-semibold',
          isOverdue ? 'bg-(--color-urgent-soft) text-(--color-urgent)' : 'bg-(--color-violet-soft) text-primary-ink'
        )}
      >
        {status}
      </span>
    </div>
  )
}
