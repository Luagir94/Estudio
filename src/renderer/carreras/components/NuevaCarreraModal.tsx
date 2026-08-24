// Presentational form (design §4, node `XcaXd`): React Hook Form + Zod,
// reusing the SAME `createProgramInputSchema` the main-process handler
// validates against.
//
// The grading scheme is chosen here and only here: it decides whether the
// program has an average at all, and every subject under it has to agree, so
// there is no "change it later" affordance to build.
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Calculator } from 'lucide-react'
import { createProgramInputSchema, type CreateProgramInput } from '../../../shared/ipc/carreras'
import { translateValidationMessage } from '../../shared/lib/translateValidationMessage'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { Select } from '../../shared/components/ui/select'
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'
import { ColorSwatchPicker, SUBJECT_COLORS } from '../../shared/components/ColorSwatchPicker'

interface NuevaCarreraModalProps {
  onSubmit: (input: CreateProgramInput) => void
  onClose: () => void
}

// The scale is the TOP of the range, not a fixed 1-10 — see
// carreras/domain/program.ts. These are the common ones; the field stays a
// number so an institution outside the list is a data change, not a code one.
const SCALES = [10, 20, 100]

export function NuevaCarreraModal({ onSubmit, onClose }: NuevaCarreraModalProps): React.JSX.Element {
  const { t } = useTranslation('carreras')
  // No explicit useForm<T> generic: `institution` is a zod preprocess field,
  // so the resolver's input type diverges from CreateProgramInput (the
  // post-parse output) — same reasoning as NuevaMateriaModal.
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(createProgramInputSchema),
    defaultValues: {
      name: '',
      institution: '',
      color: SUBJECT_COLORS[0],
      gradingScheme: 'numerico' as const,
      gradeScale: 10 as number | null
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
      <DialogContent role="dialog" aria-label={t('nuevaCarreraModal.dialogLabel')} onDismiss={onClose}>
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">{t('nuevaCarreraModal.title')}</h2>
          <p className="text-body-sm text-muted-foreground">{t('nuevaCarreraModal.subtitle')}</p>
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
                <p className="pb-3 text-caption text-muted-foreground">{t('nuevaCarreraModal.scaleNote')}</p>
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
                  {gradingScheme === 'numerico' ? t('carreraForm.numericHasAverage') : t('carreraForm.binaryNoGrades')}
                </strong>
                <p className="text-caption leading-relaxed text-secondary-foreground">
                  {gradingScheme === 'numerico' ? t('carreraForm.numericExplainer') : t('carreraForm.binaryExplainer')}
                </p>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <p className="text-caption text-muted-foreground">{t('nuevaCarreraModal.footerNote')}</p>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit">{t('nuevaCarreraModal.submit')}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogOverlay>
  )
}
