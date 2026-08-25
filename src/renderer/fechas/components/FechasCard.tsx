// Presentational (approved design: the "FECHAS ADMINISTRATIVAS" card in the
// carrera detail's right rail, directly under "AVANCE ACADÉMICO"). Same
// surface language as the cátedra card in SubjectDetail — `rounded-xl border
// border-border bg-card` — with a muted overline heading, one row per date,
// and an accent action at the foot. No data fetching, no IPC: that lives in
// FechasCardContainer.
//
// The row is the ONLY entry point to editing (and, through the form's footer,
// to deleting) a date: the design gives it no per-row icon buttons, and the
// rail is 336px wide — a delete affordance on every row would cost more space
// than the dates themselves.
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AcademicDateRecord } from '../../../shared/ipc/fechas'
import { cn } from '../../shared/lib/cn'
import { interactive, interactiveSurface } from '../../shared/lib/interactive'
import { formatAcademicDateRange, isPastAcademicDate } from '../domain/academicDate'

interface FechasCardProps {
  dates: AcademicDateRecord[]
  /** Reference instant for de-emphasizing dates that have already passed. Defaults to the real clock. */
  now?: Date
  onAdd: () => void
  onSelect: (academicDate: AcademicDateRecord) => void
}

export function FechasCard({ dates, now = new Date(), onAdd, onSelect }: FechasCardProps): React.JSX.Element {
  const { t } = useTranslation('fechas')
  // By start date, oldest first: this card is the carrera's calendar, read
  // top to bottom, not a to-do list ordered by pressure. The urgency ordering
  // belongs to Entregas, where the dates compete with real deliverables.
  const ordered = [...dates].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.id - b.id)

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <span className="text-overline font-semibold text-muted-foreground">{t('fechasCard.heading')}</span>

      {ordered.length === 0 && <p className="text-body-sm text-muted-foreground">{t('fechasCard.empty')}</p>}

      {ordered.map((academicDate) => {
        // A past date is history, not a task. It stays listed — the carrera
        // keeps its record — but it stops competing for attention, the same
        // way a completed entrega drops to muted ink.
        const past = isPastAcademicDate(academicDate, now)
        const range = formatAcademicDateRange(academicDate.startsOn, academicDate.endsOn)
        return (
          <button
            key={academicDate.id}
            type="button"
            data-testid="fechas-card-row"
            onClick={() => onSelect(academicDate)}
            aria-label={t('fechasCard.editRow', { title: academicDate.title, range })}
            className={cn('-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 text-left', interactiveSurface)}
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-body-sm font-semibold',
                past ? 'text-muted-foreground' : 'text-foreground'
              )}
            >
              {academicDate.title}
            </span>
            <span
              className={cn(
                'shrink-0 text-body-sm font-semibold',
                past ? 'text-muted-foreground' : 'text-secondary-foreground'
              )}
            >
              {range}
            </span>
          </button>
        )
      })}

      {/* `interactiveGhost` is deliberately NOT used here: its hover resolves
          the ink to `text-foreground`, which would repaint the one accent
          affordance on this card as ordinary text for as long as the mouse
          rested on it. Opacity is already in `interactive`'s transition list,
          so this reacts without giving up the accent. */}
      <button
        type="button"
        onClick={onAdd}
        className={cn(
          '-mx-2 flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-body-sm font-semibold text-primary-ink',
          interactive,
          'hover:opacity-80 active:opacity-60'
        )}
      >
        {t('fechasCard.add')}
        <Plus className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  )
}
