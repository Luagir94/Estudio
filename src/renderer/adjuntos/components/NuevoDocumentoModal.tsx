// Presentational form (approved design, node `Uu27N` — "Nuevo documento",
// authored and verified via the Pencil MCP tools): one NOMBRE field, the file
// name it will produce, and the note that this is NOT a class apunte.
//
// One field, and that is the whole design: an apunte is named by its class
// date, a generated artifact by the model, and this one by the student — so
// the name is the only thing this dialog can possibly ask for. Everything
// else (the seed content, the slug, the `.md`) is derived.
//
// No data fetching, no IPC — that lives in AdjuntosContainer.
import { zodResolver } from '@hookform/resolvers/zod'
import { Info } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { markdownDocumentFileName } from '../../../shared/domain/markdownDocument'
import { createMarkdownDocumentInputSchema, type CreateMarkdownDocumentInput } from '../../../shared/ipc/adjuntos'
import { Button } from '../../shared/components/ui/button'
import { ActionError } from '../../shared/components/ui/action-error'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { DiscardChangesDialog } from '../../shared/components/ui/discard-changes-dialog'
import { FieldError, useFieldErrors } from '../../shared/components/ui/field-error'
import { useDiscardGuard, useValuesDirtyCheck } from '../../shared/lib/useDiscardGuard'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { translateValidationMessage } from '../../shared/lib/translateValidationMessage'

// Visible-field-only form schema — derived from the same shared IPC schema
// minus `subjectId`, so validation stays in lockstep with the command
// contract without the subject ever becoming a field the user picks.
const documentFormSchema = createMarkdownDocumentInputSchema.omit({ subjectId: true })

interface NuevoDocumentoModalProps {
  /** Fixed subject reference, known from context — never a user-chosen field. */
  subjectId: number
  subjectName: string
  /**
   * Why the last submit did not go through. Already app-owned Spanish copy
   * (`shared/lib/ipcErrorCopy.ts`) — never the raw IPC message.
   */
  error?: string | null
  /** True while the write is in flight — the submit locks so one document cannot be created twice. */
  pending?: boolean
  onSubmit: (input: CreateMarkdownDocumentInput) => void
  onClose: () => void
}

export function NuevoDocumentoModal({
  subjectId,
  subjectName,
  error,
  pending,
  onSubmit,
  onClose
}: NuevoDocumentoModalProps): React.JSX.Element {
  const { t } = useTranslation('adjuntos')
  const fields = useFieldErrors()
  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(documentFormSchema),
    defaultValues: { name: '' }
  })

  // The file name is DERIVED and shown, never asked for: the student names a
  // document, not a file, and this line is how they find out what the two
  // have to do with each other. Same function main names the file with, so
  // the preview cannot drift from what actually lands on disk.
  const typedName = watch('name').trim()
  const title = t('nuevoDocumentoModal.title')
  const nameField = fields.bind('name', errors.name && translateValidationMessage(t, errors.name.message))

  const guard = useDiscardGuard({ isDirty: useValuesDirtyCheck(getValues), onClose })

  return (
    <>
      <DialogOverlay>
        <DialogContent role="dialog" aria-label={title} onDismiss={guard.onDismiss}>
          <DialogHeader onClose={guard.requestClose}>
            <h2 className="font-display text-title font-bold text-foreground">{title}</h2>
            <p className="text-body-sm text-muted-foreground">{subjectName}</p>
          </DialogHeader>

          <form onSubmit={handleSubmit((values) => onSubmit({ ...values, subjectId }))} className="contents">
            <DialogBody>
              <div className="flex flex-col gap-2">
                <Label>
                  {t('nuevoDocumentoModal.nameField')}
                  <Input
                    type="text"
                    placeholder={t('nuevoDocumentoModal.namePlaceholder')}
                    {...register('name')}
                    {...nameField.control}
                  />
                </Label>
                {/* Only once there is a name: an empty field has no file name to
                  promise, and "Se guarda como documento.md" would promise the
                  fallback as if the student had chosen it. */}
                {typedName !== '' && (
                  <p className="text-caption text-muted-foreground">
                    {t('nuevoDocumentoModal.fileNameHint', { fileName: markdownDocumentFileName(typedName) })}
                  </p>
                )}
              </div>
              <FieldError {...nameField.error} />

              <div className="flex items-start gap-3 rounded-lg border border-primary bg-sidebar-accent px-4 py-3">
                <Info className="mt-px h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
                <p className="text-caption leading-relaxed text-secondary-foreground">
                  {t('nuevoDocumentoModal.effectNote')}
                </p>
              </div>
            </DialogBody>

            <DialogFooter className="justify-between">
              {/* The failure takes the footer-note slot (same as the parcial and
                clase dialogs): a note about where the document will end up is
                noise while the form is telling you it never got there. */}
              {error ? (
                <ActionError message={error} className="text-caption" />
              ) : (
                <p className="text-caption text-muted-foreground">{t('nuevoDocumentoModal.footerHint')}</p>
              )}
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={guard.requestClose}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={pending}>
                  {t('nuevoDocumentoModal.submit')}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogOverlay>

      {guard.isConfirming && <DiscardChangesDialog onKeepEditing={guard.keepEditing} onDiscard={guard.discard} />}
    </>
  )
}
