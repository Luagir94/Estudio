// "¿Descartar los cambios?" — the question a form modal asks before throwing
// away what you typed (design: `Screen — Descartar cambios`, node
// `Modal — Descartar cambios`, approved 2026-08-30).
//
// It is the SAME shape as the six delete confirmations the app already ships
// (`DeleteSubjectConfirmDialog` and friends): a 420px panel, the question, a
// secondary line, then Cancel beside the destructive action. Nothing new was
// invented for it — a seventh dialog language would have been the whole cost
// of this feature.
//
// It renders OVER the form dialog, which stays mounted. That is not a detail:
// the typed values live in the form's own state, so unmounting it to show this
// question would make "Seguir editando" return to an empty form — the guard
// causing the exact loss it exists to prevent.
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { DialogBody, DialogContent, DialogFooter, DialogOverlay } from './dialog'

interface DiscardChangesDialogProps {
  /** "Seguir editando" — also what Escape does here. */
  onKeepEditing: () => void
  /** "Descartar cambios" — closes the form and loses the input. */
  onDiscard: () => void
}

export function DiscardChangesDialog({ onKeepEditing, onDiscard }: DiscardChangesDialogProps): React.JSX.Element {
  const { t } = useTranslation('common')
  return (
    <DialogOverlay>
      <DialogContent
        role="dialog"
        aria-label={t('discardChanges.dialogLabel')}
        className="max-w-[420px]"
        // Escape is the SAFE exit, the same rule every confirm dialog here
        // follows: it keeps the form, it never discards.
        onDismiss={onKeepEditing}
      >
        <DialogBody className="gap-2">
          <p className="text-body-lg text-foreground">{t('discardChanges.confirmQuestion')}</p>
          <p className="text-body-sm text-secondary-foreground">{t('discardChanges.note')}</p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onKeepEditing}>
            {t('discardChanges.keepEditing')}
          </Button>
          <Button type="button" variant="destructive" onClick={onDiscard}>
            {t('discardChanges.discard')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
