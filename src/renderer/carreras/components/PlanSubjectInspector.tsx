// Presentational (approved `.pen`, the right column of node `NQFkc`): the rail
// while a materia is selected on the plan map.
//
// It exists so a correlativa can be created WITHOUT leaving the map. The
// picker itself is `CorrelativasFieldContainer`, passed in as a slot rather
// than imported here — the same composition `SubjectDetail` already uses for
// it, and the reason this panel does not own a second way to write the same
// edge. `wouldCreateCycle` keeps that one write path honest; a second one would
// eventually disagree with it.
//
// A PANEL, not a bare column: it is molded on the `Totals Card` the unselected
// plan screen already draws beside the same map — same surface, radius, 1px
// border and padding. Floating loose against the canvas, it never read as an
// inspector.
//
// WHY A CORRELATIVA IS NOT DRAWN BY DRAGGING: an edge carries a LEVEL
// (aprobada / regularizada), not just a direction. A drop would still have to
// open a picker, so dragging buys nothing and costs the keyboard.
import { useTranslation } from 'react-i18next'
import { cn } from '../../shared/lib/cn'
import { interactive } from '../../shared/lib/interactive'

interface PlanSubjectInspectorProps {
  subjectName: string
  /** `CorrelativasFieldContainer` for this materia — it owns its own mutations. */
  correlativasSlot: React.ReactNode
  /** Omitted and the panel offers no way into the full materia. */
  onOpenSubject?: () => void
}

export function PlanSubjectInspector({
  subjectName,
  correlativasSlot,
  onOpenSubject
}: PlanSubjectInspectorProps): React.JSX.Element {
  const { t } = useTranslation('carreras')

  return (
    <div
      data-testid="plan-subject-inspector"
      className="flex w-full flex-col gap-3.5 rounded-xl border border-border bg-card p-4 min-[820px]:w-[260px] min-[820px]:shrink-0"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-body-lg font-semibold text-foreground">{subjectName}</span>
        {onOpenSubject !== undefined && (
          <button
            type="button"
            onClick={onOpenSubject}
            className={cn('shrink-0 text-body-sm font-semibold text-primary-ink', interactive)}
          >
            {t('planMap.openSubjectLink')}
          </button>
        )}
      </div>

      <div className="h-px w-full bg-border" aria-hidden />

      {/* 6px, not the panel's 14: this hint and the field's closing note are
          one block of prose behind one divider, and the divider is the field's
          — it owns the note that opens the block. */}
      <div className="flex flex-col gap-1.5">
        {correlativasSlot}
        <p className="text-body-sm text-muted-foreground">{t('planMap.inspectorHint')}</p>
      </div>
    </div>
  )
}
