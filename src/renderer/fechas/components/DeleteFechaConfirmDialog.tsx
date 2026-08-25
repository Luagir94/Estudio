// Presentational: the one explicit confirmation before an administrative
// date is destroyed. Mirrors `entregas/components/DeleteDeadlineConfirmDialog
// .tsx` — a single question, no undo. Deleting a date cascades to nothing (it
// is not an aggregate root for anything), so there is no destroyed-count to
// report, unlike the carrera- and materia-delete dialogs.
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogOverlay } from '../../shared/components/ui/dialog'

interface DeleteFechaConfirmDialogProps {
  dateTitle: string
  /** Why the last attempt did not go through. App-owned copy, never the raw IPC message. */
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteFechaConfirmDialog({
  dateTitle,
  error,
  onConfirm,
  onCancel
}: DeleteFechaConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation('fechas')
  return (
    <DialogOverlay>
      <DialogContent
        role="dialog"
        aria-label={t('deleteFechaDialog.dialogLabel', { title: dateTitle })}
        className="max-w-[420px]"
        onDismiss={onCancel}
      >
        <DialogBody className="gap-2">
          <p className="text-body-lg text-foreground">{t('deleteFechaDialog.confirmQuestion', { title: dateTitle })}</p>
          {error && <p className="text-body-sm text-destructive">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {t('deleteFechaDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
