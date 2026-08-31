// Presentational form (design §4, node `A1dN7` — verified via the Pencil
// MCP tools): React Hook Form + Zod, reusing the shared SlotEditor.
// campusUrl/notas/attendanceMinPercent are deliberately absent — they are
// edit-form-only (spec: "Subject Field Set"), not part of creation. The
// design also shows an ASISTENCIA toggle on this screen, but
// `createSubjectInputSchema` has no `attendanceMinPercent` field; adding it
// here would be a schema change, which is out of scope for a
// presentation-only fidelity pass — see the UI fidelity pass report.
import { zodResolver } from '@hookform/resolvers/zod'
import { TriangleAlert } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { createSubjectInputSchema, type CreateSubjectInput } from '../../../shared/ipc/materias'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import { SlotEditor } from '../../shared/components/SlotEditor'
import type { BusySpan } from '../../shared/domain/slotOverlap'
import { translateValidationMessage } from '../../shared/lib/translateValidationMessage'
import { PeriodSelect } from './PeriodSelect'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { DiscardChangesDialog } from '../../shared/components/ui/discard-changes-dialog'
import { FieldError, useFieldErrors } from '../../shared/components/ui/field-error'
import { useDiscardGuard, useValuesDirtyCheck } from '../../shared/lib/useDiscardGuard'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { ColorSwatchPicker, SUBJECT_COLORS } from '../../shared/components/ColorSwatchPicker'

interface NuevaMateriaModalProps {
  onSubmit: (input: CreateSubjectInput) => void
  onClose: () => void
  /**
   * The way out of the "no periods yet" dead end (see `hasPeriods` below):
   * navigates to Carreras, where the user can create the period this form
   * is blocked on. Optional because this modal has two other call sites
   * (`PeriodDetailContainer`, `CarreraDetailContainer`) that only ever open
   * it already scoped to an existing período — the dead end is unreachable
   * from them, so they have nothing to navigate to. Falls back to `onClose`
   * when omitted, matching the old dismiss-only behavior.
   */
  onGoToCarreras?: () => void
  /** Hours other subjects already occupy, for the slot editor's overlap warning. */
  busySlots?: BusySpan[]
  /** Programs with their periods, for the período picker. */
  programs?: ProgramWithPeriods[]
  /**
   * Pre-selected período. Resolved by the container via
   * carreras/domain/period.ts's `pickDefaultPeriodId` — subjects are added
   * after their period exists, so the active one is almost always the
   * answer, and it stays visible in the select for the rare time it is not.
   */
  defaultPeriodId?: number | null
  /** True while the write is in flight — the submit button locks so the record cannot be written twice. */
  pending?: boolean
}

export function NuevaMateriaModal({
  onSubmit,
  onClose,
  onGoToCarreras,
  busySlots = [],
  programs = [],
  defaultPeriodId = null,
  pending
}: NuevaMateriaModalProps): React.JSX.Element {
  const { t } = useTranslation('materias')
  const fields = useFieldErrors()
  // No explicit useForm<T> generic: the zod preprocess fields (docente,
  // contacto) give the resolver an input type that diverges from
  // CreateSubjectInput (the post-parse output type) — letting TypeScript
  // infer TFieldValues from the resolver itself keeps both sides aligned.
  const {
    register,
    handleSubmit,
    control,
    getValues,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(createSubjectInputSchema),
    defaultValues: {
      name: '',
      code: '',
      color: SUBJECT_COLORS[0],
      docente: '',
      contacto: '',
      periodId: defaultPeriodId,
      slots: []
    }
  })

  // A subject is always born inside a period, so with none available there
  // is no valid form to fill in. Blocking here with the reason beats
  // rendering a form whose only outcome is a validation error.
  const hasPeriods = programs.some((program) => program.periods.length > 0)

  // Bound once per field, so the control's `aria-describedby` and the
  // paragraph's `id` can never be written out of step with each other.
  const nameField = fields.bind('name', errors.name && translateValidationMessage(t, errors.name.message))
  const codeField = fields.bind('code', errors.code && translateValidationMessage(t, errors.code.message))
  const colorField = fields.bind('color', errors.color && translateValidationMessage(t, errors.color.message))
  const periodField = fields.bind('periodId', errors.periodId && translateValidationMessage(t, errors.periodId.message))
  const slotsField = fields.bind('slots', errors.slots && translateValidationMessage(t, errors.slots.message))
  const guard = useDiscardGuard({ isDirty: useValuesDirtyCheck(getValues), onClose })

  if (!hasPeriods) {
    return (
      <DialogOverlay>
        <DialogContent role="dialog" aria-label={t('nuevaMateriaModal.dialogLabel')} onDismiss={onClose}>
          <DialogHeader onClose={onClose}>
            <h2 className="font-display text-title font-bold text-foreground">{t('nuevaMateriaModal.title')}</h2>
            <p className="text-body-sm text-muted-foreground">{t('nuevaMateriaModal.noPeriodsSubtitle')}</p>
          </DialogHeader>

          <DialogBody>
            <div className="flex items-start gap-3 rounded-lg border border-warn bg-warn-soft px-4 py-3">
              <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <strong className="text-body-sm font-semibold text-foreground">
                  {t('nuevaMateriaModal.noPeriodsTitle')}
                </strong>
                <p className="text-caption leading-relaxed text-secondary-foreground">
                  {t('nuevaMateriaModal.noPeriodsBodyLead')}{' '}
                  <strong>{t('nuevaMateriaModal.noPeriodsBodyStrong')}</strong>
                  {t('nuevaMateriaModal.noPeriodsBodyRest')}
                </p>
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="justify-end">
            <Button type="button" variant="outline" onClick={onGoToCarreras ?? onClose}>
              {t('nuevaMateriaModal.goToCarreras')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogOverlay>
    )
  }

  return (
    <>
      <DialogOverlay>
        <DialogContent role="dialog" aria-label={t('nuevaMateriaModal.dialogLabel')} onDismiss={guard.onDismiss}>
          <DialogHeader onClose={guard.requestClose}>
            <h2 className="font-display text-title font-bold text-foreground">{t('nuevaMateriaModal.title')}</h2>
            <p className="text-body-sm text-muted-foreground">{t('nuevaMateriaModal.subtitle')}</p>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="contents">
            <DialogBody>
              <Label>
                {t('common:fields.name')}
                <Input type="text" {...register('name')} {...nameField.control} />
              </Label>
              <FieldError {...nameField.error} />

              <div className="flex gap-4">
                <Label className="w-[170px] shrink-0">
                  {t('nuevaMateriaModal.code')}
                  {/* An identifier, not prose: nothing to suggest and nothing to
                    spellcheck. Same for docente/contacto below, which name a
                    TEACHER — autofill offering the student's own name or
                    address there is wrong every time it fires. */}
                  <Input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    {...register('code')}
                    {...codeField.control}
                  />
                </Label>
                {/* A fieldset, not a `Label`: this control is six buttons and an
                  input, and a `<label>` can only point at one of them. The
                  legend borrows Label's own classes so the row still reads as
                  one pair of fields. */}
                <fieldset className="flex flex-1 flex-col">
                  <legend className="mb-1 block text-label font-semibold text-secondary-foreground">
                    {t('nuevaMateriaModal.colorLegend')}
                  </legend>
                  <Controller
                    name="color"
                    control={control}
                    render={({ field }) => <ColorSwatchPicker value={field.value} onChange={field.onChange} />}
                  />
                </fieldset>
              </div>
              <FieldError {...codeField.error} />
              <FieldError {...colorField.error} />

              <div className="flex gap-4">
                <Label className="flex-1">
                  {t('nuevaMateriaModal.teacher')}
                  <Input type="text" autoComplete="off" {...register('docente')} />
                </Label>
                <Label className="flex-1">
                  {t('nuevaMateriaModal.contact')}
                  <Input type="text" autoComplete="off" {...register('contacto')} />
                </Label>
              </div>

              <PeriodSelect
                programs={programs}
                registration={register('periodId')}
                allowNone={false}
                control={periodField.control}
              />
              <FieldError {...periodField.error} />

              <Controller
                name="slots"
                control={control}
                render={({ field }) => (
                  <SlotEditor value={field.value} onChange={field.onChange} busySlots={busySlots} />
                )}
              />
              <FieldError {...slotsField.error} />
            </DialogBody>

            <DialogFooter className="justify-between">
              <p className="text-caption text-muted-foreground">{t('nuevaMateriaModal.footerNote')}</p>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={guard.requestClose}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={pending}>
                  {t('nuevaMateriaModal.submit')}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogOverlay>

      {/* Rendered BESIDE the form, not instead of it: the typed values live in
          the form's own state, so unmounting it here would make "Seguir
          editando" come back to an empty form. */}
      {guard.isConfirming && <DiscardChangesDialog onKeepEditing={guard.keepEditing} onDiscard={guard.discard} />}
    </>
  )
}
