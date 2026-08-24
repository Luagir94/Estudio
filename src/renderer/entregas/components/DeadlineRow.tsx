// Presentational (design §4, node `AHToB` — DeadlineRow, verified via the
// Pencil MCP tools: Date Chip [44px, `$surface-sunken`, 8px radius] + title
// [14px/600] + Subject Tag [7px dot + 12px label] + Status Pill [fully
// rounded, colored per bucket]). No data fetching, no IPC — that lives in
// EntregasContainer.
//
// The static mockup only draws the read surface; it does not show HOW full
// CRUD (amendment 7) is reached from this row. Clicking the row body opens
// the reused "Nueva entrega" form for editing (spec: "Edit corrects a wrong
// fecha límite"); a done checkbox and a delete icon button are ADDITIVE
// affordances not present in the static screenshot, needed to reach
// `entregas:setDone`/`entregas:delete` without forcing every toggle/delete
// through the modal — disclosed as a deviation in the apply-progress report.
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDeadlineStatus } from '../domain/deadline'
import type { DeadlineWithSubject } from '../../../shared/ipc/entregas'
import { cn } from '../../shared/lib/cn'
import { interactive, interactiveGhostDestructive, interactiveSurface } from '../../shared/lib/interactive'

interface DeadlineRowProps {
  deadline: DeadlineWithSubject
  /** Reference instant for the status pill. Defaults to the real clock. */
  now?: Date
  onEdit: (deadline: DeadlineWithSubject) => void
  onToggleDone: (done: boolean) => void
  onDelete: (deadline: DeadlineWithSubject) => void
}

function statusPillClassName(deadline: DeadlineWithSubject, daysOverdue: boolean): string {
  if (deadline.done) {
    return 'bg-muted text-muted-foreground'
  }
  if (daysOverdue) {
    return 'bg-(--color-urgent-soft) text-(--color-urgent)'
  }
  return 'bg-(--color-violet-soft) text-primary-ink'
}

export function DeadlineRow({
  deadline,
  now = new Date(),
  onEdit,
  onToggleDone,
  onDelete
}: DeadlineRowProps): React.JSX.Element {
  const { t } = useTranslation('entregas')
  // Same consolidated month table the read-only Hoy dashboard row reads (`hoy/components/DeadlineRow.tsx`) — no duplication.
  const monthLabels = t('common:monthsCaps', { returnObjects: true }) as string[]
  const dueDate = new Date(deadline.dueAt)
  const status = formatDeadlineStatus(deadline.dueAt, deadline.done, now)
  const isOverdue = !deadline.done && status.endsWith('de atraso')

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <input
        type="checkbox"
        aria-label={deadline.done ? t('deadlineRow.markPending') : t('deadlineRow.markDone')}
        checked={deadline.done}
        onChange={(event) => onToggleDone(event.target.checked)}
        className={cn('h-4 w-4 shrink-0 rounded-sm border-border accent-(--color-violet)', interactive)}
      />

      {/* The row body is one of THREE targets in this row (checkbox, body,
          delete), so its hover has to show exactly how far it reaches. The
          negative margin cancels the padding: the highlight gets room to
          breathe without shifting a single pixel of the row's layout. */}
      <button
        type="button"
        onClick={() => onEdit(deadline)}
        className={cn('-mx-2 -my-1 flex flex-1 items-center gap-4 rounded-lg px-2 py-1 text-left', interactiveSurface)}
      >
        <span className="flex w-11 shrink-0 flex-col items-center gap-1 rounded-lg bg-muted py-2">
          <span
            className={cn('text-body-lg font-semibold', deadline.done ? 'text-muted-foreground' : 'text-foreground')}
          >
            {dueDate.getDate().toString().padStart(2, '0')}
          </span>
          <span className="text-overline font-semibold text-muted-foreground">{monthLabels[dueDate.getMonth()]}</span>
        </span>

        <span className="flex flex-1 flex-col gap-1">
          <span
            className={cn(
              'text-body-lg font-semibold',
              deadline.done ? 'text-muted-foreground line-through' : 'text-foreground'
            )}
          >
            {deadline.title}
          </span>
          <span className="flex items-center gap-2 text-body-sm text-secondary-foreground">
            <span
              aria-hidden="true"
              style={{ backgroundColor: deadline.subjectColor }}
              className="h-[7px] w-[7px] shrink-0 rounded-full"
            />
            {deadline.subjectName}
          </span>
        </span>
      </button>

      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-1 text-caption font-semibold',
          statusPillClassName(deadline, isOverdue)
        )}
      >
        {status}
      </span>

      <button
        type="button"
        onClick={() => onDelete(deadline)}
        aria-label={t('deadlineRow.delete')}
        className={cn('-m-2 shrink-0 rounded-md p-2 text-muted-foreground', interactiveGhostDestructive)}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
