// Presentational form (design §4, node `HE9Wn` — "Nueva entrega", verified
// via the Pencil MCP tools, re-verified 2026-08-15 after amendment 8): TÍTULO
// input, then a row of TIPO + FECHA LÍMITE. Reused for BOTH create and edit
// (spec: "Editing MUST reuse the 'Nueva entrega' form and the same
// validation schema used for creation") — `mode` only changes the
// title/subtitle/submit-label copy and whether `defaultValues` prefill the
// fields; the field set itself never diverges between the two modes.
//
// Amendment 8: the design no longer has a MATERIA field. The subject is
// known from context — the subject detail screen creation was launched
// from, or the existing deadline's subject when editing — and is passed in
// as the fixed `subjectId` prop, merged into the submitted payload but never
// rendered or chosen by the user (spec: "materia MUST NOT be a field the
// user selects on the creation form").
//
// The design's TIPO "Select" visual shows a chevron inside a custom listbox.
// This renders it as a plain native `<select>` instead — same simplification
// already established by `shared/components/SlotEditor.tsx`'s día picker
// ("native selects keep full keyboard/a11y behavior with zero extra
// dependency surface").
//
// TIPO's option set (`entregas:nuevaEntregaModal.types` — Trabajo práctico/
// Parcial/Informe/Examen final/Otro) is NOT specified by the spec or design —
// the mockup shows only one example value ("Trabajo práctico"). This is an
// inferred, disclosed judgment call from the row titles visible in the design
// (TP.../Parcial.../Informe...).
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { createDeadlineInputSchema, type CreateDeadlineInput } from '../../../shared/ipc/entregas'
import { translateValidationMessage } from '../../shared/lib/translateValidationMessage'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { Select } from '../../shared/components/ui/select'

// Visible-field-only form schema (title/type/dueAt) — derived from the same
// shared IPC schema `createDeadlineInputSchema` minus `subjectId`, so
// validation stays in lockstep with the command contract without ever
// rendering or requiring the user to fill `subjectId`.
const deadlineFormSchema = createDeadlineInputSchema.omit({ subjectId: true })
type DeadlineFormValues = Omit<CreateDeadlineInput, 'subjectId'>

interface NuevaEntregaModalProps {
  mode: 'create' | 'edit'
  /** Fixed subject reference, known from context — never a user-chosen field (amendment 8). */
  subjectId: number
  defaultValues?: DeadlineFormValues
  onSubmit: (input: CreateDeadlineInput) => void
  onClose: () => void
}

export function NuevaEntregaModal({
  mode,
  subjectId,
  defaultValues,
  onSubmit,
  onClose
}: NuevaEntregaModalProps): React.JSX.Element {
  const { t } = useTranslation('entregas')
  const deadlineTypes = t('nuevaEntregaModal.types', { returnObjects: true }) as string[]
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(deadlineFormSchema),
    defaultValues: defaultValues ?? { title: '', type: deadlineTypes[0], dueAt: '' }
  })

  const title = mode === 'create' ? t('nuevaEntregaModal.createTitle') : t('nuevaEntregaModal.editTitle')
  const subtitle = mode === 'create' ? t('nuevaEntregaModal.createSubtitle') : t('nuevaEntregaModal.editSubtitle')
  const submitLabel = mode === 'create' ? t('nuevaEntregaModal.createSubmit') : t('common:actions.saveChanges')

  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label={title} onDismiss={onClose}>
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">{title}</h2>
          <p className="text-body-sm text-muted-foreground">{subtitle}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit((values) => onSubmit({ ...values, subjectId }))} className="contents">
          <DialogBody>
            <Label>
              {t('nuevaEntregaModal.titleField')}
              <Input type="text" {...register('title')} />
            </Label>
            {errors.title && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.title.message)}</p>
            )}

            <div className="flex gap-3">
              <Label className="flex-1">
                {t('nuevaEntregaModal.type')}
                <Select {...register('type')}>
                  {deadlineTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label className="flex-1">
                {t('nuevaEntregaModal.dueAt')}
                <Input type="datetime-local" {...register('dueAt')} />
              </Label>
            </div>
            {errors.type && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.type.message)}</p>
            )}
            {errors.dueAt && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.dueAt.message)}</p>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogOverlay>
  )
}
