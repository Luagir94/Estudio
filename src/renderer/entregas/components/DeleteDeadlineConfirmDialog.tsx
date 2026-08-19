// Presentational (design §4, spec "Delete removes a cancelled deadline
// entirely, not as done"): mirrors `materias/components/
// DeleteSubjectConfirmDialog.tsx`'s pattern — a single explicit confirmation,
// no undo. Deleting a deadline cascades to nothing (Deadline is not an
// aggregate root for anything else), so there is no destroyed-count to
// report here, unlike the subject-delete dialog.
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
  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label={`Eliminar ${deadlineTitle}`} className="max-w-[420px]">
        <DialogBody className="gap-2">
          <p className="text-body-lg text-foreground">
            ¿Eliminar la entrega &quot;{deadlineTitle}&quot;? Esta acción no se puede deshacer.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Eliminar entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
