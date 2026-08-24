// Presentational (design §4, spec "Subject Deletion Cascade"): the
// confirmation count IS the safety control — no other confirmation, no
// undo. A zero-deadline subject shows no count at all rather than a
// misleading "0 entregas" phrasing that reads like something was omitted.
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogOverlay } from '../../shared/components/ui/dialog'

interface DeleteSubjectConfirmDialogProps {
  subjectName: string
  deadlineCount: number
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteSubjectConfirmDialog({
  subjectName,
  deadlineCount,
  onConfirm,
  onCancel
}: DeleteSubjectConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation('materias')
  return (
    <DialogOverlay>
      <DialogContent
        role="dialog"
        aria-label={t('deleteSubjectConfirmDialog.dialogLabel', { name: subjectName })}
        className="max-w-[420px]"
        onDismiss={onCancel}
      >
        <DialogBody className="gap-2">
          <p className="text-body-lg text-foreground">
            {t('deleteSubjectConfirmDialog.confirmQuestion', { name: subjectName })}
          </p>
          {deadlineCount > 0 && (
            <p className="text-body-lg text-destructive">
              {t('deleteSubjectConfirmDialog.deadlinesWarning', { count: deadlineCount })}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {t('deleteSubjectConfirmDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
