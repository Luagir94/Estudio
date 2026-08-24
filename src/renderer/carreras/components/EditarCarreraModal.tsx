// Presentational form (design node `QZAQD` — "Screen — Editar carrera"):
// React Hook Form + Zod over the SAME `updateProgramInputSchema` the
// main-process handler validates against, mirroring NuevaCarreraModal.
//
// Editing and DELETING a carrera live together here, in one modal — the same
// shape as EditarMateriaModal, and the reason the detail header carries no
// standalone delete button.
//
// The one field that is not simply editable is the grading scheme. It is not
// frozen forever (that was the old behaviour, and it made a carrera created
// with the wrong scale permanent); it is frozen ONCE SOMETHING HAS BEEN
// GRADED. See carreras/domain/program.ts's `hasRecordedEvaluations` for why:
// changing a graded program's scale REINTERPRETS every recorded grade instead
// of rescaling it.
//
// When it is locked the fields are REMOVED, not disabled — a greyed-out
// control invites a click it will never honour, and the note below says what
// happened instead.
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Calculator, Lock, Trash2 } from 'lucide-react'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { Select } from '../../shared/components/ui/select'
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'
import { ColorSwatchPicker, SUBJECT_COLORS } from '../../shared/components/ColorSwatchPicker'
import { translateValidationMessage } from '../../shared/lib/translateValidationMessage'
import {
  type ProgramWithPeriods,
  updateProgramInputSchema,
  type UpdateProgramInput
} from '../../../shared/ipc/carreras'
import { hasRecordedEvaluations } from '../domain/program'

interface EditarCarreraModalProps {
  program: ProgramWithPeriods
  /** Already app-owned Spanish copy (`shared/lib/ipcErrorCopy.ts`) — never the raw IPC message. */
  error?: string | null
  onSubmit: (input: UpdateProgramInput) => void
  onDelete: () => void
  onClose: () => void
}

// Same list as NuevaCarreraModal — the scale is a data choice, not a code one.
const SCALES = [10, 20, 100]

export function EditarCarreraModal({
  program,
  error,
  onSubmit,
  onDelete,
  onClose
}: EditarCarreraModalProps): React.JSX.Element {
  const { t } = useTranslation('carreras')
  // The lock is computed from the roll-up main already ships, so the form
  // never has to ask a second question to find out what it may offer.
  const locked = hasRecordedEvaluations(program.gradedSubjects)

  // No explicit useForm<T> generic: `institution` is a zod preprocess field,
  // so the resolver's input type diverges from UpdateProgramInput (the
  // post-parse output) — same reasoning as NuevaCarreraModal.
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(updateProgramInputSchema),
    defaultValues: {
      id: program.id,
      name: program.name,
      institution: program.institution ?? '',
      color: program.color,
      gradingScheme: program.gradingScheme,
      gradeScale: program.gradeScale
    }
  })

  const gradingScheme = watch('gradingScheme')
  const color = watch('color')

  // Scheme and scale move together: a pass/fail program must carry NO scale
  // (the schema rejects one), so switching clears it instead of leaving a
  // stale 10 behind that would fail validation on submit.
  const selectScheme = (scheme: 'numerico' | 'binario'): void => {
    setValue('gradingScheme', scheme)
    setValue('gradeScale', scheme === 'binario' ? null : 10)
  }

  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label={t('editarCarreraModal.title')}>
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">{t('editarCarreraModal.title')}</h2>
          <p className="text-body-sm text-muted-foreground">{t('editarCarreraModal.subtitle')}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="contents">
          <DialogBody>
            <Label>
              {t('common:fields.name')}
              <Input type="text" {...register('name')} />
            </Label>
            {errors.name && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.name.message)}</p>
            )}

            <Label>
              {t('carreraForm.institution')}
              <Input type="text" {...register('institution')} />
            </Label>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-label font-semibold text-secondary-foreground">
                {t('carreraForm.colorLegend')}
              </legend>
              <ColorSwatchPicker value={color} onChange={(next) => setValue('color', next)} />
            </fieldset>

            <span aria-hidden="true" className="h-px w-full bg-border" />

            {locked ? (
              <div className="flex items-start gap-3 rounded-lg border border-border bg-sidebar px-4 py-3">
                <Lock className="mt-px h-4 w-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <strong className="text-body-sm font-semibold text-foreground">
                    {t('editarCarreraModal.lockedTitle')}
                  </strong>
                  <p className="text-caption leading-relaxed text-secondary-foreground">
                    {t('editarCarreraModal.lockedBody', {
                      scheme:
                        program.gradingScheme === 'numerico'
                          ? t('editarCarreraModal.lockedSchemeNumeric', { scale: program.gradeScale })
                          : t('editarCarreraModal.lockedSchemeBinary')
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-label font-semibold text-secondary-foreground">
                    {t('carreraForm.schemeLegend')}
                  </legend>
                  <div className="flex w-fit items-center gap-1 rounded-lg border border-border bg-background p-1">
                    {(
                      [
                        ['numerico', t('gradingScheme.numerico')],
                        ['binario', t('gradingScheme.binario')]
                      ] as const
                    ).map(([scheme, label]) => (
                      <button
                        key={scheme}
                        type="button"
                        aria-pressed={gradingScheme === scheme}
                        onClick={() => selectScheme(scheme)}
                        className={cn(
                          gradingScheme === scheme
                            ? 'rounded-md bg-primary px-4 py-2 text-body-sm font-semibold text-primary-foreground'
                            : 'rounded-md px-4 py-2 text-body-sm font-semibold text-secondary-foreground',
                          interactiveChip
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {gradingScheme === 'numerico' && (
                  <div className="flex items-end gap-4">
                    <Label className="w-[170px] shrink-0">
                      {t('carreraForm.scale')}
                      <Select {...register('gradeScale', { valueAsNumber: true })}>
                        {SCALES.map((scale) => (
                          <option key={scale} value={scale}>
                            {t('carreraForm.scaleOption', { max: scale })}
                          </option>
                        ))}
                      </Select>
                    </Label>
                    <p className="pb-3 text-caption text-muted-foreground">{t('editarCarreraModal.scaleNote')}</p>
                  </div>
                )}
                {errors.gradeScale && (
                  <p className="text-body-lg text-destructive">
                    {translateValidationMessage(t, errors.gradeScale.message)}
                  </p>
                )}

                <div className="flex items-start gap-3 rounded-lg border border-primary bg-sidebar-accent px-4 py-3">
                  <Calculator className="mt-px h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <strong className="text-body-sm font-semibold text-foreground">
                      {gradingScheme === 'numerico'
                        ? t('carreraForm.numericHasAverage')
                        : t('carreraForm.binaryNoGrades')}
                    </strong>
                    <p className="text-caption leading-relaxed text-secondary-foreground">
                      {gradingScheme === 'numerico'
                        ? t('carreraForm.numericExplainer')
                        : t('carreraForm.binaryExplainer')}
                    </p>
                  </div>
                </div>
              </>
            )}

            {error && <p className="text-body-lg text-destructive">{error}</p>}
          </DialogBody>

          <DialogFooter className="justify-between">
            <Button
              type="button"
              variant="ghost"
              className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('editarCarreraModal.delete')}
            </Button>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit">{t('common:actions.saveChanges')}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogOverlay>
  )
}
