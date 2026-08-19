// Presentational (design §4, node `fMy0V`): the periods table.
//
// The "año YYYY · derivado de la fecha de inicio" line is deliberate copy,
// not decoration: it is the app telling the user why there is no year field
// to fill in (see carreras/domain/period.ts's derivePeriodYear).
//
// The row body OPENS the period (design node `TfFjk` — "Screen — Período
// (detalle)"); editing is the pencil in the ACCIONES cell. The two were the
// same gesture until the period got a screen of its own, and one gesture
// cannot mean both "show me what is in here" and "let me change it".
import { Pencil, Trash2 } from 'lucide-react'
import { derivePeriodYear, formatPeriodRange, periodStatus, type PeriodStatus } from '../domain/period'
import type { PeriodRecord } from '../../../shared/ipc/carreras'
import { cn } from '../../shared/lib/cn'
import { interactiveGhost, interactiveGhostDestructive, interactiveSurface } from '../../shared/lib/interactive'

interface PeriodsTableProps {
  periods: PeriodRecord[]
  now: Date
  /**
   * How many materias live in each period, keyed by period id (design node
   * `fMy0V`'s MATERIAS column).
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

const STATUS_LABELS: Record<PeriodStatus, string> = {
  activo: 'Activo',
  finalizado: 'Finalizado',
  proximo: 'Próximo'
}

const STATUS_STYLES: Record<PeriodStatus, string> = {
  activo: 'border-primary bg-sidebar-accent text-primary-ink',
  finalizado: 'border-border bg-muted text-muted-foreground',
  proximo: 'border-border bg-muted text-secondary-foreground'
}

function formatSubjectCount(count: number | undefined): string {
  if (count === undefined) {
    return '—'
  }
  if (count === 0) {
    return 'Sin materias'
  }
  return `${count} materia${count === 1 ? '' : 's'}`
}

export function PeriodsTable({
  periods,
  now,
  subjectCounts,
  onSelect,
  onEdit,
  onDelete
}: PeriodsTableProps): React.JSX.Element {
  if (periods.length === 0) {
    return (
      <p className="text-body-lg text-muted-foreground">
        Esta carrera todavía no tiene períodos. Agregá uno para poder ubicar materias en el tiempo.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 px-4">
        {/* Same three-tier column-dropping rule as MateriasList, every hidden
            cell keyed to the SAME breakpoint in header and row. MATERIAS goes
            first because the list right below this table answers it in full;
            TIPO next, being a label the period name usually repeats; FECHAS
            last, because it is the reason this table exists. */}
        <span className="min-w-0 flex-1 text-overline font-semibold text-muted-foreground">PERÍODO</span>
        <span className="hidden w-[140px] shrink-0 text-overline font-semibold text-muted-foreground lg:block">
          TIPO
        </span>
        <span className="hidden w-[210px] shrink-0 text-overline font-semibold text-muted-foreground md:block">
          FECHAS
        </span>
        <span className="hidden w-[110px] shrink-0 text-overline font-semibold text-muted-foreground xl:block">
          MATERIAS
        </span>
        <span className="w-[110px] shrink-0 text-overline font-semibold text-muted-foreground">ESTADO</span>
        {/* Keeps the headings over their columns once the rows grow their
            trailing icon buttons: 16px each plus the 16px gap between them =
            48 (design node `W4Z1ES`'s ACCIONES cell, which is 48 wide with a
            16 gap). The buttons' `-m-2` cancels out — it pulls each border box
            in by 8 on both sides — so their LAYOUT width is the icon's 16, not
            the padded 32, and the spacer matches without any fudge factor. */}
        {(onEdit || onDelete) && (
          <span aria-hidden="true" className={cn('shrink-0', onEdit && onDelete ? 'w-12' : 'w-4')} />
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {periods.map((period) => {
          const status = periodStatus(period, now)
          // The columns are identical in both modes — only the element
          // wrapping them changes — so the read-only table cannot drift away
          // from the editable one.
          const columns = (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <strong className="truncate text-body-lg font-semibold text-foreground">{period.name}</strong>
                <span className="text-caption text-muted-foreground">
                  año {derivePeriodYear(period.startsOn)} · derivado de la fecha de inicio
                </span>
              </span>

              <span className="hidden w-[140px] shrink-0 lg:block">
                <span className="rounded-md bg-muted px-2 py-1 text-caption font-medium text-secondary-foreground">
                  {period.kind}
                </span>
              </span>

              <span className="hidden w-[210px] shrink-0 text-body-sm text-secondary-foreground md:block">
                {formatPeriodRange(period.startsOn, period.endsOn)}
              </span>

              {/* A missing KEY in a map that exists means zero; only a
                  missing MAP means "not known yet". Reading `?.get()` alone
                  would print an empty period as pending, forever. */}
              <span className="hidden w-[110px] shrink-0 text-body-sm text-secondary-foreground xl:block">
                {formatSubjectCount(subjectCounts === undefined ? undefined : (subjectCounts.get(period.id) ?? 0))}
              </span>

              <span className="w-[110px] shrink-0">
                <span className={`rounded-md border px-2 py-1 text-caption font-semibold ${STATUS_STYLES[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
              </span>
            </>
          )

          return (
            <li key={period.id} className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-4">
              {onSelect ? (
                // Negative margins cancel the padding: the hover highlight
                // gets room to breathe without shifting the row's columns
                // (same trick as DeadlineRow's body button).
                <button
                  type="button"
                  onClick={() => onSelect(period)}
                  className={cn(
                    '-mx-2 -my-1 flex min-w-0 flex-1 items-center gap-4 rounded-lg px-2 py-1 text-left',
                    interactiveSurface
                  )}
                >
                  {columns}
                </button>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-4">{columns}</span>
              )}

              {/* Both labels name the PERIOD, not the action alone: a screen
                  reader hearing "Editar" four times in a four-row table has
                  been told nothing. */}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(period)}
                  aria-label={`Editar ${period.name}`}
                  className={cn('-m-2 shrink-0 rounded-md p-2 text-muted-foreground', interactiveGhost)}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
              )}

              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(period)}
                  aria-label={`Eliminar ${period.name}`}
                  className={cn('-m-2 shrink-0 rounded-md p-2 text-muted-foreground', interactiveGhostDestructive)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
