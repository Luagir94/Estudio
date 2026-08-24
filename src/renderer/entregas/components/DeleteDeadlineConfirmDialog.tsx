// Presentational (design §4, spec "Delete removes a cancelled deadline
// entirely, not as done"): mirrors `materias/components/
// DeleteSubjectConfirmDialog.tsx`'s pattern — a single explicit confirmation,
// no undo. Deleting a deadline cascades to nothing (Deadline is not an
// aggregate root for anything else), so there is no destroyed-count to
// report here, unlike the subject-delete dialog.
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogOverlay } from '../../shared/components/ui/dialog'

interface DeleteDeadlineConfirmDialogProps {
  deadlineTitle: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteDeadlineConfirmDialog({
  deadlineTitle,
  onConfirm,
  onCancel
}: DeleteDeadlineConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation('entregas')
  return (
    <DialogOverlay>
      <DialogContent
        role="dialog"
        aria-label={t('deleteDeadlineConfirmDialog.dialogLabel', { title: deadlineTitle })}
        className="max-w-[420px]"
        onDismiss={onCancel}
      >
        <DialogBody className="gap-2">
          <p className="text-body-lg text-foreground">
            {t('deleteDeadlineConfirmDialog.confirmQuestion', { title: deadlineTitle })}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {t('deleteDeadlineConfirmDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
