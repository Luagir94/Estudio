// Presentational form (design node `DyF1c`): adds one final-exam instance.
//
// The date field carries an explicit "opcional" badge and an empty
// placeholder because that is the whole point: you can write down a mesa
// before the institution publishes its calendar.
import { zodResolver } from '@hookform/resolvers/zod'
import { Pause } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { createFinalExamInputSchema, type CreateFinalExamInput } from '../../../shared/ipc/finales'
import { translateValidationMessage } from '../../shared/lib/translateValidationMessage'
import { Button } from '../../shared/components/ui/button'
import { ActionError } from '../../shared/components/ui/action-error'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { DiscardChangesDialog } from '../../shared/components/ui/discard-changes-dialog'
import { FieldError, useFieldErrors } from '../../shared/components/ui/field-error'
import { useDiscardGuard, useValuesDirtyCheck } from '../../shared/lib/useDiscardGuard'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { Select } from '../../shared/components/ui/select'

interface NuevaInstanciaModalProps {
  subjectId: number
  subjectName: string
  /**
   * Why the last submit did not go through. Without this the form just sits
   * there on a failed write and the button reads as broken. Already
   * app-owned Spanish copy (`shared/lib/ipcErrorCopy.ts`) — never the raw
   * IPC message.
   */
  error?: string | null
  /** True while the write is in flight — the submit button locks so one mesa cannot be recorded twice. */
  pending?: boolean
  onSubmit: (input: CreateFinalExamInput) => void
  onClose: () => void
}

export function NuevaInstanciaModal({
  subjectId,
  subjectName,
  error,
  pending,
  onSubmit,
  onClose
}: NuevaInstanciaModalProps): React.JSX.Element {
  const { t } = useTranslation('finales')
  const fields = useFieldErrors()
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(createFinalExamInputSchema),
    defaultValues: { subjectId, label: '', takenOn: null as string | null, result: 'pendiente' as const }
  })

  const labelField = fields.bind('label', errors.label && translateValidationMessage(t, errors.label.message))
  const takenOnField = fields.bind('takenOn', errors.takenOn && translateValidationMessage(t, errors.takenOn.message))

  const guard = useDiscardGuard({ isDirty: useValuesDirtyCheck(getValues), onClose })

  return (
    <>
      <DialogOverlay>
        <DialogContent role="dialog" aria-label={t('nuevaInstanciaModal.dialogLabel')} onDismiss={guard.onDismiss}>
          <DialogHeader onClose={guard.requestClose}>
            <h2 className="font-display text-title font-bold text-foreground">{t('nuevaInstanciaModal.title')}</h2>
            <p className="text-body-sm text-muted-foreground">{subjectName}</p>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="contents">
            <DialogBody>
              <Label>
                {t('nuevaInstanciaModal.labelField')}
                <Input
                  type="text"
                  placeholder={t('nuevaInstanciaModal.labelPlaceholder')}
                  {...register('label')}
                  {...labelField.control}
                />
              </Label>
              <FieldError {...labelField.error} />

              <div className="flex flex-col gap-2">
                <Label>
                  <span className="flex items-center gap-2">
                    {t('nuevaInstanciaModal.date')}
                    <span className="rounded-md bg-muted px-2 py-px text-micro font-semibold text-muted-foreground">
                      {t('nuevaInstanciaModal.optionalBadge')}
                    </span>
                  </span>
                  <Input
                    type="date"
                    {...register('takenOn', { setValueAs: (value: string) => (value === '' ? null : value) })}
                    {...takenOnField.control}
                  />
                </Label>
                <p className="text-caption text-muted-foreground">{t('nuevaInstanciaModal.dateHint')}</p>
              </div>
              <FieldError {...takenOnField.error} />

              <Label className="w-[200px]">
                {t('nuevaInstanciaModal.result')}
                <Select {...register('result')}>
                  <option value="pendiente">{t('nuevaInstanciaModal.resultOptions.pendiente')}</option>
                  <option value="aprobado">{t('nuevaInstanciaModal.resultOptions.aprobado')}</option>
                  <option value="reprobado">{t('nuevaInstanciaModal.resultOptions.reprobado')}</option>
                </Select>
              </Label>

              <div className="flex items-start gap-3 rounded-lg border border-primary bg-sidebar-accent px-4 py-3">
                <Pause className="mt-px h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
                <p className="text-caption leading-relaxed text-secondary-foreground">
                  {t('nuevaInstanciaModal.standbyNote')}
                </p>
              </div>
            </DialogBody>

            <DialogFooter>
              {/* The failure takes the footer-note slot (same as
                NuevoPeriodoModal): a note about what you CAN do is noise
                while the form is telling you what just did not happen. */}
              {error ? (
                <ActionError message={error} className="text-caption" />
              ) : (
                <p className="text-caption text-muted-foreground">{t('nuevaInstanciaModal.footerNote')}</p>
              )}
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={guard.requestClose}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={pending}>
                  {t('nuevaInstanciaModal.submit')}
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
