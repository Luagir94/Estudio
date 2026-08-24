// Presentational (design §4, node `AHToB` — DeadlineRow: Date Chip + title +
// Subject Tag + Status Pill). READ-ONLY variant for Hoy — unlike
// `entregas/components/DeadlineRow.tsx`, this row has no checkbox, no click-
// to-edit, and no delete affordance (design node `VQJO4`: Hoy is a
// "read-model... sin acciones primarias"). Reuses `formatDeadlineStatus`
// (never re-derives status text) and the consolidated `common:monthsCaps`
// table.
import { useTranslation } from 'react-i18next'
import { classifyUrgency, formatDeadlineStatus } from '../../entregas/domain/deadline'
import type { DeadlineUrgency } from '../../entregas/domain/deadline'
import { cn } from '../../shared/lib/cn'
import { subjectColorForScheme } from '../../shared/lib/subjectColorScheme'
import { usePrefersLightScheme } from '../../shared/lib/usePrefersLightScheme'
import type { DashboardDeadline } from '../domain/dashboard'

interface HoyDeadlineRowProps {
  deadline: DashboardDeadline
  /** Reference instant for the status pill. Defaults to the real clock. */
  now?: Date
}

// Violet is reserved for interaction (Pencil design) — a status pill must
// never borrow the accent, so pending urgency grades urgent → warn → neutral.
// Same mapping as the Entregas row and SubjectDetail's deadline chips.
const urgencyPillClassNames: Record<DeadlineUrgency, string> = {
  overdue: 'bg-(--color-urgent-soft) text-(--color-urgent)',
  imminent: 'bg-(--color-warn-soft) text-(--color-warn)',
  thisWeek: 'bg-(--color-surface-sunken) text-(--color-ink-secondary)',
  later: 'bg-(--color-surface-sunken) text-(--color-ink-muted)'
}

function statusPillClassName(dueAt: string, done: boolean, now: Date): string {
  if (done) {
    return 'bg-muted text-muted-foreground'
  }
  return urgencyPillClassNames[classifyUrgency(dueAt, now)]
}

export function DeadlineRow({ deadline, now = new Date() }: HoyDeadlineRowProps): React.JSX.Element {
  const { t } = useTranslation('common')
  // Stored subject colours are the dark palette; inline styles cannot hear
  // the light media query, so the scheme mapping happens here.
  const scheme = usePrefersLightScheme() ? 'light' : 'dark'
  const monthLabels = t('monthsCaps', { returnObjects: true }) as string[]
  const dueDate = new Date(deadline.dueAt)
  const status = formatDeadlineStatus(deadline.dueAt, deadline.done, now)

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <span className="flex w-11 shrink-0 flex-col items-center gap-1 rounded-lg bg-muted py-2">
        {/* Day numeral in the display face (type consolidation pass) — the
            chip's month label stays in the UI face. */}
        <span className="font-display text-body-lg font-semibold text-foreground">
          {dueDate.getDate().toString().padStart(2, '0')}
        </span>
        <span className="text-overline font-semibold text-muted-foreground">{monthLabels[dueDate.getMonth()]}</span>
      </span>

      <span className="flex flex-1 flex-col gap-1">
        <span className="text-body-lg font-semibold text-foreground">{deadline.title}</span>
        <span className="flex items-center gap-2 text-body-sm text-secondary-foreground">
          <span
            aria-hidden="true"
            style={{ backgroundColor: subjectColorForScheme(deadline.subjectColor, scheme) }}
            className="h-[7px] w-[7px] shrink-0 rounded-full"
          />
          {deadline.subjectName}
        </span>
      </span>

      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-1 text-caption font-semibold',
          statusPillClassName(deadline.dueAt, deadline.done, now)
        )}
      >
        {status}
      </span>
    </div>
  )
}
