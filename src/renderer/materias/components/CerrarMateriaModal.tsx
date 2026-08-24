// Presentational form (design node `frIjq`, screen "Cerrar materia"):
// records what happened with a subject.
//
// The app NEVER decides this on its own — that is the whole reason this
// screen exists. "Final pendiente" is offered as a first-class answer
// precisely because it is the honest one when nothing is settled yet.
//
// Reached ONLY from the subject detail header (`onCloseSubject`), whatever
// the período's dates say. It used to hang off the Materias list's "sin
// cerrar" banner, which only rendered once a período had ENDED — so a
// promoción could not be recorded during the cursada, and because
// `finalPendiente` is set here, the finales section was unreachable too.
import { Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { validateGrade } from '../../../shared/domain/grading'
import type { SubjectOutcome, SubjectWithStatus } from '../../../shared/ipc/materias'

/**
 * Exactly what closing a subject needs, and nothing more.
 *
 * A narrow shape rather than a whole `SubjectWithStatus`: the two screens
 * that can reach this form carry different aggregates — the Materias list
 * holds `SubjectWithStatus`, the detail holds `SubjectDetailResult` (full
 * final-exam records, no `pendingDeadlines`) — and both satisfy this.
 */
export type ClosableSubject = Pick<SubjectWithStatus, 'id' | 'name' | 'outcome' | 'grade' | 'period' | 'program'>
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'

interface CerrarMateriaModalProps {
  subject: ClosableSubject
  onSubmit: (input: { id: number; outcome: SubjectOutcome | null; grade: number | null }) => void
  onClose: () => void
}

// Labels and hints live in the locale catalog under
// `cerrarMateriaModal.outcomes.<value>` — this only fixes the order.
const OUTCOME_VALUES: SubjectOutcome[] = ['aprobada', 'finalPendiente', 'reprobada']

export function CerrarMateriaModal({ subject, onSubmit, onClose }: CerrarMateriaModalProps): React.JSX.Element {
  const { t } = useTranslation('materias')
  const [outcome, setOutcome] = useState<SubjectOutcome>(subject.outcome ?? 'aprobada')
  const [grade, setGrade] = useState(subject.grade === null ? '' : String(subject.grade))

  const isNumeric = subject.program?.gradingScheme === 'numerico'
  // A grade needs a SETTLED result under a numeric program — and an aplazo is
  // as settled as a pass. `calculateProgramAverage` has always reported "con
  // aplazos" apart from "sin aplazos", a split that was unreachable while
  // this form offered a grade on `aprobada` only.
  //
  // `finalPendiente` is the one outcome excluded: nothing has happened yet,
  // so there is no number to record.
  const showsGrade = isNumeric && (outcome === 'aprobada' || outcome === 'reprobada')
  const parsedGrade = grade.trim() === '' ? null : Number(grade)

  const gradeError =
    showsGrade && parsedGrade !== null && subject.program
      ? (() => {
          if (Number.isNaN(parsedGrade)) {
            return t('cerrarMateriaModal.gradeNotANumber', { scale: subject.program.gradeScale })
          }
          const validation = validateGrade(subject.program, parsedGrade)
          // `validation.error` is an internal, English-only string (shared domain
          // module, not i18n-aware) — never rendered directly. Both failure modes
          // collapse onto the same app-owned Spanish copy, since "not a number"
          // and "out of range" are really the same user-facing rule.
          return validation.ok ? null : t('cerrarMateriaModal.gradeNotANumber', { scale: subject.program.gradeScale })
        })()
      : null

  const submit = (): void => {
    if (gradeError !== null) {
      return
    }
    onSubmit({ id: subject.id, outcome, grade: showsGrade ? parsedGrade : null })
  }

  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label={t('cerrarMateriaModal.dialogLabel')} onDismiss={onClose}>
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">{t('cerrarMateriaModal.title')}</h2>
          <p className="text-body-sm text-muted-foreground">
            {subject.name} · {subject.period?.name ?? t('cerrarMateriaModal.noPeriod')}
          </p>
        </DialogHeader>

        <DialogBody>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label font-semibold text-secondary-foreground">
              {t('cerrarMateriaModal.howItEndedLegend')}
            </legend>
            <div className="flex flex-col gap-2">
              {OUTCOME_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={outcome === value}
                  onClick={() => setOutcome(value)}
                  className={cn(
                    outcome === value
                      ? 'flex flex-col gap-1 rounded-lg border border-primary bg-sidebar-accent px-4 py-3 text-left'
                      : 'flex flex-col gap-1 rounded-lg border border-border bg-background px-4 py-3 text-left',
                    interactiveChip
                  )}
                >
                  <strong className="text-body font-semibold text-foreground">
                    {t(`cerrarMateriaModal.outcomes.${value}.label`)}
                  </strong>
                  <span className="text-caption text-muted-foreground">
                    {t(`cerrarMateriaModal.outcomes.${value}.hint`)}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {showsGrade && (
            <div className="flex flex-col gap-1">
              <Label className="w-[180px]">
                {t('cerrarMateriaModal.gradeLabel', { scale: subject.program?.gradeScale })}
                <Input
                  type="number"
                  value={grade}
                  onChange={(event) => setGrade(event.target.value)}
                  min={0}
                  max={subject.program?.gradeScale ?? undefined}
                />
              </Label>
              {outcome === 'reprobada' && (
                <p className="text-caption text-muted-foreground">{t('cerrarMateriaModal.failGradeNote')}</p>
              )}
            </div>
          )}
          {gradeError && <p className="text-body-lg text-destructive">{gradeError}</p>}

          {!isNumeric && (
            <div className="flex items-start gap-3 rounded-lg bg-muted px-4 py-3">
              <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-body-sm leading-relaxed text-secondary-foreground">
                {subject.program ? t('cerrarMateriaModal.binaryNoGrade') : t('cerrarMateriaModal.noProgramNoGrade')}
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <p className="text-caption text-muted-foreground">{t('cerrarMateriaModal.footerNote')}</p>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="button" onClick={submit} disabled={gradeError !== null}>
              {t('common:actions.saveChanges')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
