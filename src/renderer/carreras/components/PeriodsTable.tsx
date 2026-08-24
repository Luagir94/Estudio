// Presentational (design §4, node `fMy0V`): the periods list — compact
// rows in the same layout language as SubjectDetail's deadline rows, under
// a "PERÍODOS · N" section heading. The derived year prints next to the
// period name (see carreras/domain/period.ts's derivePeriodYear); the
// "derivado de la fecha de inicio" explainer lives in the period form and
// the period detail, not on every row.
//
// The row body OPENS the period (design node `TfFjk` — "Screen — Período
// (detalle)"); editing is the pencil action beside it. The two were the
// same gesture until the period got a screen of its own, and one gesture
// cannot mean both "show me what is in here" and "let me change it".
import type { TFunction } from 'i18next'
import { Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { derivePeriodYear, formatPeriodRange, periodStatus, type PeriodStatus } from '../domain/period'
import type { PeriodRecord } from '../../../shared/ipc/carreras'
import { cn } from '../../shared/lib/cn'
import { interactiveGhost, interactiveGhostDestructive, interactiveSurface } from '../../shared/lib/interactive'

interface PeriodsTableProps {
  periods: PeriodRecord[]
  now: Date
  /**
   * How many materias live in each period, keyed by period id (design node
   * `fMy0V`'s materias segment).
   *
   * `undefined` means "not known yet" — the counts come from the subjects
   * list, which loads separately — and renders as a dash. A 0 printed while
   * the answer is still in flight would be a wrong answer, not a pending one.
   */
  subjectCounts?: ReadonlyMap<number, number>
  /** Opens the period's own screen. Omit and the rows render as plain, non-clickable markup. */
  onSelect?: (period: PeriodRecord) => void
  /** Opens the period for editing. Omit to hide the action. */
  onEdit?: (period: PeriodRecord) => void
  /** Opens the delete-confirmation dialog. Omit to hide the action. */
  onDelete?: (period: PeriodRecord) => void
}

const STATUS_STYLES: Record<PeriodStatus, string> = {
  activo: 'border-primary bg-sidebar-accent text-primary-ink',
  finalizado: 'border-border bg-muted text-muted-foreground',
  proximo: 'border-border bg-muted text-secondary-foreground'
}

function formatSubjectCount(count: number | undefined, t: TFunction): string {
  if (count === undefined) {
    return '—'
  }
  if (count === 0) {
    return t('periodsTable.noSubjects')
  }
  return t('counts.subjects', { count })
}

export function PeriodsTable({
  periods,
  now,
  subjectCounts,
  onSelect,
  onEdit,
  onDelete
}: PeriodsTableProps): React.JSX.Element {
  const { t } = useTranslation('carreras')

  return (
    <div className="flex flex-col gap-2">
      {/* The count is appended outside the translation so the i18n key stays
          a plain heading (same pattern as the ADJUNTOS section heading). */}
      <h2 className="text-label font-semibold text-muted-foreground">
        {t('periodsTable.heading')}
        {periods.length > 0 && ` · ${periods.length}`}
      </h2>

      {periods.length === 0 && <p className="text-body-lg text-muted-foreground">{t('periodsTable.empty')}</p>}

      {periods.length > 0 && (
        <ul className="flex flex-col gap-2">
          {periods.map((period) => {
            const status = periodStatus(period, now)
            // The info block is identical in both modes — only the element
            // wrapping it changes — so the read-only list cannot drift away
            // from the clickable one. The count keeps its own <span> so it
            // stays an addressable answer, not a substring of the meta line.
            const info = (
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <strong className="truncate text-body-lg font-semibold text-foreground">
                  {period.name} {derivePeriodYear(period.startsOn)}
                </strong>
                <span className="truncate text-body-sm text-secondary-foreground">
                  {period.kind}
                  {' · '}
                  {formatPeriodRange(period.startsOn, period.endsOn)}
                  {' · '}
                  <span>
                    {formatSubjectCount(
                      subjectCounts === undefined ? undefined : (subjectCounts.get(period.id) ?? 0),
                      t
                    )}
                  </span>
                </span>
              </span>
            )

            return (
              <li key={period.id} className="flex items-center gap-4 rounded-lg border border-border bg-card px-3 py-2">
                {onSelect ? (
                  // Negative margins cancel the padding: the hover highlight
                  // gets room to breathe without shifting the row's content
                  // (same trick as DeadlineRow's body button).
                  <button
                    type="button"
                    onClick={() => onSelect(period)}
                    className={cn(
                      '-mx-2 -my-1 flex min-w-0 flex-1 items-center gap-4 rounded-lg px-2 py-1 text-left',
                      interactiveSurface
                    )}
                  >
                    {info}
                  </button>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-4">{info}</span>
                )}

                <span
                  className={`shrink-0 rounded-md border px-2 py-1 text-caption font-semibold ${STATUS_STYLES[status]}`}
                >
                  {t(`periodStatus.${status}`)}
                </span>

                {/* Both labels name the PERIOD, not the action alone: a screen
                    reader hearing "Editar" four times in a four-row list has
                    been told nothing. */}
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(period)}
                    aria-label={t('periodsTable.editPeriod', { name: period.name })}
                    className={cn('-m-2 shrink-0 rounded-md p-2 text-muted-foreground', interactiveGhost)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                )}

                {onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(period)}
                    aria-label={t('periodsTable.deletePeriod', { name: period.name })}
                    className={cn('-m-2 shrink-0 rounded-md p-2 text-muted-foreground', interactiveGhostDestructive)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
