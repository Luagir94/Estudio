// Presentational (design §4): mirrors `materias/components/
// DeleteSubjectConfirmDialog.tsx` — one explicit confirmation, no undo.
//
// The difference is WHAT it has to promise. Deleting a period does NOT
// delete the materias recorded under it: their `period_id` falls back to
// NULL (schema.ts's `set null`), so they stay in the app as "sin período".
// Saying so is the point of the count — a user who reads "se eliminarán N
// materias" would cancel a delete that never threatened them, and a user
// who reads nothing at all would be surprised to find those materias out of
// the carrera afterwards.
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogOverlay } from '../../shared/components/ui/dialog'

interface DeletePeriodConfirmDialogProps {
  periodName: string
  /** Materias currently living in this period — they survive, unassigned. */
  subjectCount: number
  /** Why the delete did not go through. A dead confirm button explains nothing. */
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function DeletePeriodConfirmDialog({
  periodName,
  subjectCount,
  error,
  onConfirm,
  onCancel
}: DeletePeriodConfirmDialogProps): React.JSX.Element {
  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label={`Eliminar ${periodName}`} className="max-w-[420px]">
        <DialogBody className="gap-2">
          <p className="text-body-lg text-foreground">
            ¿Eliminar el período &quot;{periodName}&quot;? Esta acción no se puede deshacer.
          </p>
          {/* A zero-subject period says nothing rather than "0 materias",
              which reads like something was left out (same rule as the
              subject-delete dialog's deadline count). */}
          {subjectCount > 0 && (
            <p className="text-body-lg text-secondary-foreground">
              {subjectCount === 1 ? '1 materia queda' : `${subjectCount} materias quedan`} sin período — no se
              {subjectCount === 1 ? ' elimina' : ' eliminan'}, pero {subjectCount === 1 ? 'sale' : 'salen'} de esta
              carrera hasta que {subjectCount === 1 ? 'la asignes' : 'las asignes'} a otro.
            </p>
          )}
          {error && <p className="text-body-lg text-destructive">No se pudo eliminar el período: {error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Eliminar período
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
