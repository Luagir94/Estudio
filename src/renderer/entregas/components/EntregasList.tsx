// Presentational (design §4, node `K6MVx` — Entregas "Groups", verified via
// the Pencil MCP tools: ATRASADAS / PRÓXIMOS 7 DÍAS / MÁS ADELANTE /
// COMPLETADAS, each an 11px/600 uppercase heading over a stack of
// DeadlineRows). No data fetching, no IPC — that lives in EntregasContainer.
import { useTranslation } from 'react-i18next'
import type { DeadlineWithSubject } from '../../../shared/ipc/entregas'
import { groupDeadlines, type DeadlineBucket } from '../domain/deadline'
import { DeadlineRow } from './DeadlineRow'

interface EntregasListProps {
  deadlines: DeadlineWithSubject[]
  /** Reference instant for bucketing and status pills. Defaults to the real clock. */
  now?: Date
  onEdit: (deadline: DeadlineWithSubject) => void
  onToggleDone: (deadline: DeadlineWithSubject, done: boolean) => void
  onDelete: (deadline: DeadlineWithSubject) => void
}

// Design order (node `K6MVx`'s "Groups" children, top to bottom).
const BUCKET_ORDER: DeadlineBucket[] = ['atrasadas', 'proximos7', 'masAdelante', 'completadas']

export function EntregasList({
  deadlines,
  now = new Date(),
  onEdit,
  onToggleDone,
  onDelete
}: EntregasListProps): React.JSX.Element {
  const { t } = useTranslation('entregas')

  if (deadlines.length === 0) {
    return <p className="text-body-lg text-muted-foreground">{t('entregasList.empty')}</p>
  }

  const groups = groupDeadlines(deadlines, now)

  return (
    <div className="flex flex-col gap-6">
      {BUCKET_ORDER.filter((bucket) => groups[bucket].length > 0).map((bucket) => (
        <div key={bucket} className="flex flex-col gap-3">
          <h3
            className={
              bucket === 'atrasadas'
                ? 'text-caption font-semibold text-(--color-urgent)'
                : 'text-caption font-semibold text-muted-foreground'
            }
          >
            {t(`entregasList.bucketHeadings.${bucket}`)}
          </h3>
          <div className="flex flex-col gap-2">
            {groups[bucket].map((deadline) => (
              <DeadlineRow
                key={deadline.id}
                deadline={deadline}
                now={now}
                onEdit={onEdit}
                onToggleDone={(done) => onToggleDone(deadline, done)}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
