// Presentational (design node `hKFg3` — "Screen — Eliminar carrera"):
// mirrors `DeletePeriodConfirmDialog.tsx` one level up the aggregate.
//
// Deleting a carrera is the ONLY correction it has. There is no
// `carreras:update` channel — `gradeScale` is fixed at creation because it
// decides whether the program has an average at all (shared/ipc/carreras.ts)
// — so a carrera created wrong can only be removed and made again. That makes
// this dialog the last thing standing between a typo and a rebuild, and the
// reason it spells out what it takes with it.
//
// It reports TWO counts because `DeleteProgramResult` returns two, and the
// delete treats them differently: the periods are destroyed with the program
// (FK cascade), the materias are NOT — their `period_id` falls back to NULL
// (schema.ts's `set null`) and they stay in the app as "sin período".
// Reporting only one of the two is what would make the dialog a lie.
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/ui/button'
import { ActionError } from '../../shared/components/ui/action-error'
import { DialogBody, DialogContent, DialogFooter, DialogOverlay } from '../../shared/components/ui/dialog'

interface DeleteProgramConfirmDialogProps {
  programName: string
  /** Periods that go WITH the carrera — these really are deleted. */
  periodCount: number
  /** Materias of this carrera — they survive, unassigned. */
  subjectCount: number
  /**
   * Why the delete did not go through. A dead confirm button explains
   * nothing. Already app-owned Spanish copy (`shared/lib/ipcErrorCopy.ts`) —
   * never the raw IPC message.
   */
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteProgramConfirmDialog({
  programName,
  periodCount,
  subjectCount,
  error,
  onConfirm,
  onCancel
}: DeleteProgramConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation('carreras')
  return (
    <DialogOverlay>
      <DialogContent
        role="dialog"
        aria-label={t('deleteProgramDialog.dialogLabel', { name: programName })}
        className="max-w-[420px]"
        onDismiss={onCancel}
      >
        <DialogBody className="gap-2">
          <p className="text-body-lg text-foreground">
            {t('deleteProgramDialog.confirmQuestion', { name: programName })}
          </p>
          {/* Each count stays silent at zero rather than saying "0", which
              reads like something was left out (same rule as the period
              dialog's materias count). */}
          {periodCount > 0 && (
            <p className="text-body-lg text-secondary-foreground">
              {t('deleteProgramDialog.periodsWarning', { count: periodCount })}
            </p>
          )}
          {subjectCount > 0 && (
            <p className="text-body-lg text-secondary-foreground">
              {t('deleteProgramDialog.subjectsWarning', { count: subjectCount })}
            </p>
          )}
          <ActionError message={error} className="text-body-lg" />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {t('deleteProgramDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
