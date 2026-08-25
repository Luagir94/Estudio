// Presentational form (approved design): records one parcial or
// recuperatorio.
//
// Molded on "Nueva instancia de final" and reused for BOTH create and edit,
// the same one-entry-point rule `NuevaEntregaModal` follows — `mode` only
// changes the title, the submit copy, whether `defaultValues` prefill the
// fields, and whether the footer offers the delete. The field set never
// diverges between the two modes.
//
// The delete lives HERE, in the footer, rather than as a trash icon on the
// row: the approved row has exactly three cells and a fourth affordance would
// not be the designed row any more. Same placement "Eliminar materia" already
// has inside "Editar materia".
//
// BOTH optional fields carry their own badge and their own hint, because both
// absences are real states and neither is a mistake: a parcial exists before
// the cátedra publishes its date, and "aprobado sin nota" is a legitimate
// result. The effect note says the thing the whole feature turns on — a
// result is a fact, the condición is a declaration.
import { zodResolver } from '@hookform/resolvers/zod'
import { Hash, Info, Trash2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { createPartialExamInputSchema, type CreatePartialExamInput } from '../../../shared/ipc/parciales'
import type { PartialExamResult } from '../../../shared/ipc/materias'
import { translateValidationMessage } from '../../shared/lib/translateValidationMessage'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'

// Visible-field-only form schema — the SAME shared IPC schema minus
// `subjectId`, so validation stays in lockstep with the command contract
// without the subject ever becoming a field the user picks.
const parcialFormSchema = createPartialExamInputSchema.omit({ subjectId: true })

export type ParcialFormValues = Omit<CreatePartialExamInput, 'subjectId'>

// Order fixed here; the labels live in the catalog.
const RESULTS: PartialExamResult[] = ['pendiente', 'aprobado', 'reprobado']

interface NuevoParcialModalProps {
  mode: 'create' | 'edit'
  /** Fixed subject reference, known from context — never a user-chosen field. */
  subjectId: number
  subjectName: string
  defaultValues?: ParcialFormValues
  /**
   * Why the last submit did not go through. Already app-owned Spanish copy
   * (`shared/lib/ipcErrorCopy.ts`) — never the raw IPC message.
   */
  error?: string | null
  /** True while the write is in flight — the submit button locks so one parcial cannot be recorded twice. */
  pending?: boolean
  onSubmit: (input: CreatePartialExamInput) => void
  /** Removes the parcial being edited. Omitted in create mode — there is nothing recorded to remove. */
  onDelete?: () => void
  onClose: () => void
}

export function NuevoParcialModal({
  mode,
  subjectId,
  subjectName,
  defaultValues,
  error,
  pending,
  onSubmit,
  onDelete,
  onClose
}: NuevoParcialModalProps): React.JSX.Element {
  const { t } = useTranslation('parciales')
  // No explicit useForm<T> generic — same reasoning as the other modals: the
  // zod preprocess fields (takenOn/grade) give the resolver a pre-parse input
  // type that diverges from the command's, and an explicit generic fights it.
  const {
    register,
    handleSubmit,
    control,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(parcialFormSchema),
    defaultValues: defaultValues ?? {
      label: '',
      takenOn: null as string | null,
      result: 'pendiente' as PartialExamResult,
      grade: null as number | null
    }
  })

  const title = mode === 'create' ? t('nuevoParcialModal.createDialogLabel') : t('nuevoParcialModal.editDialogLabel')
  const submitLabel = mode === 'create' ? t('nuevoParcialModal.createSubmit') : t('common:actions.saveChanges')

  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label={title} onDismiss={onClose}>
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">{title}</h2>
          <p className="text-body-sm text-muted-foreground">{subjectName}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit((values) => onSubmit({ ...values, subjectId }))} className="contents">
          <DialogBody>
            <Label>
              {t('nuevoParcialModal.labelField')}
              <Input type="text" placeholder={t('nuevoParcialModal.labelPlaceholder')} {...register('label')} />
            </Label>
            {errors.label && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.label.message)}</p>
            )}

            <div className="flex flex-col gap-2">
              <Label className="w-[200px]">
                <span className="flex items-center gap-2">
                  {t('nuevoParcialModal.date')}
                  <span className="rounded-md bg-muted px-2 py-px text-micro font-semibold text-muted-foreground">
                    {t('nuevoParcialModal.optionalBadge')}
                  </span>
                </span>
                <Input
                  type="date"
                  {...register('takenOn', { setValueAs: (value: string) => (value === '' ? null : value) })}
                />
              </Label>
              <p className="text-caption text-muted-foreground">{t('nuevoParcialModal.dateHint')}</p>
            </div>
            {errors.takenOn && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.takenOn.message)}</p>
            )}

            {/* A fieldset, not a `Label`: this control is three buttons, and a
                `<label>` can only point at one of them. The legend borrows
                Label's own classes so the field still reads as a pair. */}
            <Controller
              name="result"
              control={control}
              render={({ field }) => (
                <fieldset className="flex flex-col">
                  <legend className="mb-1 block text-label font-semibold text-secondary-foreground">
                    {t('nuevoParcialModal.result')}
                  </legend>
                  <div className="flex w-fit gap-1 rounded-lg border border-border bg-background p-1">
                    {RESULTS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={field.value === value}
                        onClick={() => field.onChange(value)}
                        className={cn(
                          'rounded-md px-3 py-2 text-body-sm font-semibold',
                          field.value === value ? 'bg-primary text-primary-foreground' : 'text-secondary-foreground',
                          interactiveChip
                        )}
                      >
                        {t(`nuevoParcialModal.resultOptions.${value}`)}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
            />

            <div className="flex flex-col gap-2">
              <Label className="w-[200px]">
                <span className="flex items-center gap-2">
                  {t('nuevoParcialModal.grade')}
                  <span className="rounded-md bg-muted px-2 py-px text-micro font-semibold text-muted-foreground">
                    {t('nuevoParcialModal.optionalBadge')}
                  </span>
                </span>
                {/* The hash lives INSIDE the field (approved design), so this
                    composes the Input primitive's own shell around a bare
                    input rather than nesting one control in another — the
                    same shape the asistencia "%" field already uses. */}
                <span className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3">
                  <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {/* No `setValueAs` here, unlike the date above: the shared
                      schema's own preprocess already normalizes '' / null /
                      undefined to null and coerces a numeric string, and a
                      second copy of that rule in the form would only be one
                      more thing to keep in step. */}
                  <input
                    type="number"
                    step="any"
                    className="w-full bg-transparent text-body-lg text-foreground outline-none"
                    {...register('grade')}
                  />
                </span>
              </Label>
              <p className="text-caption text-muted-foreground">{t('nuevoParcialModal.gradeHint')}</p>
            </div>
            {errors.grade && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.grade.message)}</p>
            )}

            <div className="flex items-start gap-3 rounded-lg border border-primary bg-sidebar-accent px-4 py-3">
              <Info className="mt-px h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
              <p className="text-caption leading-relaxed text-secondary-foreground">
                {t('nuevoParcialModal.effectNote')}
              </p>
            </div>
          </DialogBody>

          <DialogFooter className="justify-between">
            <div className="flex items-center gap-3">
              {mode === 'edit' && onDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {t('nuevoParcialModal.delete')}
                </Button>
              )}
              {/* The failure takes the footer-note slot (same as
                  NuevaInstanciaModal): a note about what you CAN do is noise
                  while the form is telling you what just did not happen. */}
              {error ? (
                <p className="text-caption text-destructive">{error}</p>
              ) : (
                <p className="text-caption text-muted-foreground">{t('nuevoParcialModal.footerNote')}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={pending}>
                {submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogOverlay>
  )
}
