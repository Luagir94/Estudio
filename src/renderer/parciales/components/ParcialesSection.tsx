// Presentational (approved design): the PARCIALES section of the subject
// detail's left column, between ENTREGAS and NOTAS.
//
// Molded on the ENTREGAS section directly above it — same heading step, same
// compact primary add button — and on the finales instance row for the rows
// themselves. Three cells only: name, date, result. There is deliberately no
// fourth "nota" column: the nota rides INSIDE the result badge
// (domain/partialExamBadge.ts), which is what the design draws.
//
// The row body is a BUTTON, which the static mockup does not draw: it is the
// one entry point to editing a parcial (and, through the reused form's
// footer, to deleting one) — the same additive affordance the entregas row
// already documents, and the reason no trash icon crowds the designed
// three-cell row.
//
// Nothing here reads or writes the subject's `regularity`: a parcial never
// decides the condición.
import { Calendar, CalendarOff, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PartialExamRecord } from '../../../shared/ipc/materias'
// The finales date formatter, reused rather than re-invented — a parcial's
// fecha is the same kind of value as a mesa's (a calendar day, year always
// shown, malformed input rendered raw). Same cross-slice domain reuse the
// subject detail already does with `entregas/domain/deadline`.
import { formatTakenOn } from '../../finales/domain/finalDate'
import { partialExamBadgeLabel } from '../domain/partialExamBadge'
import { TabActionSlot } from '../../shared/components/tabActionSlot'
import { Button } from '../../shared/components/ui/button'
import { DotBadge, type DotBadgeTone } from '../../shared/components/ui/dot-badge'
import { cn } from '../../shared/lib/cn'
import { interactiveSurface } from '../../shared/lib/interactive'

interface ParcialesSectionProps {
  parciales: PartialExamRecord[]
  onAdd: () => void
  /** Opens the reused "Nuevo parcial" form on this row — the one entry point to editing AND deleting it. */
  onEdit: (parcial: PartialExamRecord) => void
}

// Same three tones the regularidad badge uses, mapped from the RESULT rather
// than from the condición — they are different questions that happen to share
// a palette.
const RESULT_TONES: Record<PartialExamRecord['result'], DotBadgeTone> = {
  aprobado: 'ok',
  reprobado: 'urgent',
  pendiente: 'neutral'
}

export function ParcialesSection({ parciales, onAdd, onEdit }: ParcialesSectionProps): React.JSX.Element {
  const { t } = useTranslation('parciales')

  return (
    <section className="flex w-full flex-col gap-2" aria-label={t('parcialesSection.heading')}>
      {/* No heading of its own: inside the subject detail the PARCIALES tab
          already names this section, and the same word twice 12px apart is
          not hierarchy. The name survives as the section's accessible label,
          which is what a screen reader needs either way.

          The add button travels to the tab bar's action slot — one section
          action on screen, always the active tab's. Mounted outside that tab
          bar (its own test, any other host) the slot renders it right here. */}
      <TabActionSlot>
        {/* Compact action (approved design: 7/12 padding, 12px/600 label,
            14px icon). Tonal, not solid — a section action never outranks
            the screen's own primary. */}
        <Button variant="tonal" size="compact" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t('parcialesSection.add')}
        </Button>
      </TabActionSlot>

      {parciales.length === 0 && <p className="text-body-lg text-muted-foreground">{t('parcialesSection.empty')}</p>}

      {parciales.map((parcial) => (
        <button
          key={parcial.id}
          type="button"
          data-testid="subject-detail-parcial"
          onClick={() => onEdit(parcial)}
          className={cn(
            'flex w-full items-center gap-4 rounded-lg border border-border bg-background px-4 py-3 text-left',
            interactiveSurface
          )}
        >
          <span className="min-w-0 flex-1 text-body-lg font-semibold text-foreground">{parcial.label}</span>

          <span className="flex w-[130px] shrink-0 items-center gap-2 text-body-sm">
            {parcial.takenOn === null ? (
              <>
                <CalendarOff className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">{t('parcialesSection.noDateYet')}</span>
              </>
            ) : (
              <>
                <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-secondary-foreground">{formatTakenOn(parcial.takenOn)}</span>
              </>
            )}
          </span>

          <span className="flex w-[150px] shrink-0">
            <DotBadge tone={RESULT_TONES[parcial.result]}>{partialExamBadgeLabel(t, parcial)}</DotBadge>
          </span>
        </button>
      ))}
    </section>
  )
}
