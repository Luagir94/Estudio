// Presentational (design §4, spec "Subject Deletion Cascade"): the
// confirmation count IS the safety control — no other confirmation, no
// undo. A zero-deadline subject shows no count at all rather than a
// misleading "0 entregas" phrasing that reads like something was omitted.
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
  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label={`Eliminar ${subjectName}`} className="max-w-[420px]">
        <DialogBody className="gap-2">
          <p className="text-body-lg text-foreground">
            ¿Eliminar la materia &quot;{subjectName}&quot;? Esta acción no se puede deshacer.
          </p>
          {deadlineCount > 0 && (
            <p className="text-body-lg text-destructive">
              Se eliminarán {deadlineCount} {deadlineCount === 1 ? 'entrega' : 'entregas'}.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Eliminar materia
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
