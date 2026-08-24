// Presentational: mirrors `materias/components/DeleteSubjectConfirmDialog.tsx`
// and its siblings (`carreras/components/DeletePeriodConfirmDialog.tsx`,
// `DeleteProgramConfirmDialog.tsx`, `entregas/components/
// DeleteDeadlineConfirmDialog.tsx`) — one explicit confirmation before a
// `variant="destructive"` button changes stored data, naming the object and
// stating the consequence in the question, with the confirm button labeled
// with the action rather than "OK".
//
// Unlike the dialogs above, this one is NOT reporting something permanent.
// `SubjectDetail.tsx`'s "Cerrar materia" button is rendered unconditionally
// in the header — it is never gated on the subject's current outcome — so
// `CerrarMateriaModal` stays reachable after giving up, still lets the
// student pick any of `aprobada` / `finalPendiente` / `reprobada`, and
// `materiasApi.setOutcome` (`sqliteSubjectRepository.ts`'s `setOutcome`)
// unconditionally overwrites the stored value. So this copy never says "no
// se puede deshacer" — that would be false here — it says what changes and
// names the exact way back.
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogOverlay } from '../../shared/components/ui/dialog'

interface GiveUpConfirmDialogProps {
  subjectName: string
  /**
   * Why the outcome was not recorded. A dead confirm button explains
   * nothing. Already app-owned Spanish copy (`shared/lib/ipcErrorCopy.ts`) —
   * never the raw IPC message.
   */
  error?: string | null
  /** True while the write is in flight — the confirm button locks so one decision cannot be recorded twice. */
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function GiveUpConfirmDialog({
  subjectName,
  error,
  pending,
  onConfirm,
  onCancel
}: GiveUpConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation('finales')
  return (
    <DialogOverlay>
      <DialogContent
        role="dialog"
        aria-label={t('giveUpConfirmDialog.dialogLabel', { name: subjectName })}
        className="max-w-[420px]"
        onDismiss={onCancel}
      >
        <DialogBody className="gap-2">
          <p className="text-body-lg text-foreground">
            {t('giveUpConfirmDialog.confirmQuestion', { name: subjectName })}
          </p>
          <p className="text-body-lg text-secondary-foreground">{t('giveUpConfirmDialog.reversibleHint')}</p>
          {error && <p className="text-body-lg text-destructive">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {t('giveUpConfirmDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
