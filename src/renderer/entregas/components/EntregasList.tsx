// Presentational (design §4, node `K6MVx` — Entregas "Groups", verified via
// the Pencil MCP tools: ATRASADAS / PRÓXIMOS 7 DÍAS / MÁS ADELANTE /
// COMPLETADAS, each an 11px/600 uppercase heading over a stack of
// DeadlineRows). No data fetching, no IPC — that lives in EntregasContainer.
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DeadlineWithSubject } from '../../../shared/ipc/entregas'
import type { AcademicDateWithProgram } from '../../../shared/ipc/fechas'
import { AcademicDateRow } from '../../fechas/components/AcademicDateRow'
import { groupAcademicDates, relevantAcademicDate } from '../../fechas/domain/academicDate'
import { groupDeadlines, type DeadlineBucket } from '../domain/deadline'
import { DeadlineRow } from './DeadlineRow'

interface EntregasListProps {
  deadlines: DeadlineWithSubject[]
  /**
   * Administrative dates of the student's carreras, which share these groups
   * (approved design). Already filtered to the upcoming ones by
   * `groupAcademicDates` — a closed inscription window is not a pending task.
   */
  academicDates?: AcademicDateWithProgram[]
  /** Reference instant for bucketing and status pills. Defaults to the real clock. */
  now?: Date
  onEdit: (deadline: DeadlineWithSubject) => void
  onToggleDone: (deadline: DeadlineWithSubject, done: boolean) => void
  onDelete: (deadline: DeadlineWithSubject) => void
}

// One group, one chronology. A trámite closing before an entrega is due reads
// above it, exactly like two entregas would — sorting them into separate
// stacks inside a shared heading would make the group lie about its order.
//
// The two sort keys compare correctly against each other as plain strings: a
// deadline's `YYYY-MM-DDTHH:mm` and a date's `YYYY-MM-DD` share a prefix, so
// the whole-day date sorts to the start of its day, which is what it means.
type GroupItem =
  | { kind: 'deadline'; sortKey: string; deadline: DeadlineWithSubject }
  | { kind: 'academicDate'; sortKey: string; academicDate: AcademicDateWithProgram }

// Design order (node `K6MVx`'s "Groups" children, top to bottom).
const BUCKET_ORDER: DeadlineBucket[] = ['atrasadas', 'proximos7', 'masAdelante', 'completadas']

export function EntregasList({
  deadlines,
  academicDates = [],
  now = new Date(),
  onEdit,
  onToggleDone,
  onDelete
}: EntregasListProps): React.JSX.Element {
  const { t } = useTranslation('entregas')

  const groups = groupDeadlines(deadlines, now)
  const dateGroups = groupAcademicDates(academicDates, now)

  // Counted AFTER grouping, because a past administrative date drops out of
  // `dateGroups` entirely — "there is nothing here" has to mean nothing this
  // screen would have shown, not nothing that was passed in.
  const upcomingDateCount = Object.values(dateGroups).reduce((total, bucket) => total + bucket.length, 0)
  if (deadlines.length === 0 && upcomingDateCount === 0) {
    return <p className="text-body-lg text-muted-foreground">{t('entregasList.empty')}</p>
  }

  // All clear = both URGENT buckets empty (approved design): whatever sits in
  // MÁS ADELANTE / COMPLETADAS, nothing is late and nothing is due this week.
  // Deliberately distinct from the zero-deadlines return above — an empty
  // account is not an achievement.
  //
  // The administrative dates count here too: "estás al día" is a claim about
  // the whole week, and a trámite closing inside it withdraws the claim.
  const allClear =
    groups.atrasadas.length === 0 &&
    groups.proximos7.length === 0 &&
    dateGroups.atrasadas.length === 0 &&
    dateGroups.proximos7.length === 0
  // Ascending within the bucket already, so [0] IS the next later deadline.
  const nextLater = groups.masAdelante[0]

  const itemsIn = (bucket: DeadlineBucket): GroupItem[] =>
    [
      ...groups[bucket].map((deadline): GroupItem => ({ kind: 'deadline', sortKey: deadline.dueAt, deadline })),
      ...dateGroups[bucket].map((academicDate): GroupItem => ({
        kind: 'academicDate',
        sortKey: relevantAcademicDate(academicDate),
        academicDate
      }))
    ].sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  return (
    <div className="flex flex-col gap-6">
      {allClear && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ok-soft">
            <Check className="h-5 w-5 text-ok" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-display text-title font-semibold text-foreground">{t('entregasList.allClear.title')}</p>
            <p className="text-body text-secondary-foreground">
              {nextLater
                ? t('entregasList.allClear.subtitleWithNext', {
                    date: format(parseISO(nextLater.dueAt), "d 'de' MMMM", { locale: es })
                  })
                : t('entregasList.allClear.subtitle')}
            </p>
          </div>
        </div>
      )}
      {BUCKET_ORDER.map((bucket) => ({ bucket, items: itemsIn(bucket) }))
        .filter(({ items }) => items.length > 0)
        .map(({ bucket, items }) => (
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
              {items.map((item) =>
                item.kind === 'deadline' ? (
                  <DeadlineRow
                    key={`deadline-${item.deadline.id}`}
                    deadline={item.deadline}
                    now={now}
                    onEdit={onEdit}
                    onToggleDone={(done) => onToggleDone(item.deadline, done)}
                    onDelete={onDelete}
                  />
                ) : (
                  <AcademicDateRow key={`fecha-${item.academicDate.id}`} date={item.academicDate} now={now} />
                )
              )}
            </div>
          </div>
        ))}
    </div>
  )
}
