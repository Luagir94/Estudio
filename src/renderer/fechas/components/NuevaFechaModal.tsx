// Presentational form (approved design: "Nueva fecha administrativa"). React
// Hook Form + Zod, reusing the SAME `createAcademicDateInputSchema` the
// main-process handler validates against.
//
// Reused for BOTH create and edit, the same rule NuevoPeriodoModal and
// NuevaEntregaModal already follow: the presence of `academicDate` IS the
// mode — there is no separate flag that could contradict it — and it only
// changes the title/subtitle/submit copy, whether the fields start prefilled,
// and whether the delete is offered. The field set never diverges.
//
// The form always speaks the CREATION contract, `programId` included; the
// container is what turns that into an update (which takes no `programId`,
// because a date never changes carrera).
//
// TIPO is a picker over a closed catalogue, and the hint beside it says what
// the catalogue is FOR: it classifies the row and nothing else. A student who
// believes "Inscripción a finales" makes the app do something — open a
// window, chase a mesa — would be surprised twice: once when it does not, and
// again when they avoid "Otro" for fear of losing behaviour they never had.
import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import {
  academicDateKindSchema,
  type AcademicDateRecord,
  createAcademicDateInputSchema,
  type CreateAcademicDateInput
} from '../../../shared/ipc/fechas'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { Select } from '../../shared/components/ui/select'
import { translateValidationMessage } from '../../shared/lib/translateValidationMessage'

interface NuevaFechaModalProps {
  programId: number
  programName: string
  /**
   * The date being edited. Its presence IS the mode — everything the edit
   * form needs (the values, the id, whether to offer the delete) comes from
   * this one object.
   */
  academicDate?: AcademicDateRecord
  /**
   * Why the last submit did not go through. Without it the form just sits
   * there on a failed write and the button reads as broken. Already app-owned
   * Spanish copy (`shared/lib/ipcErrorCopy.ts`) — never the raw IPC message.
   */
  error?: string | null
  onSubmit: (input: CreateAcademicDateInput) => void
  /**
   * Opens the delete confirmation. Only ever rendered while editing — a
   * date that does not exist yet has nothing to destroy.
   */
  onDelete?: () => void
  onClose: () => void
}

// `<input type="date">` emits '' when cleared; the schema wants a null.
const emptyToNull = { setValueAs: (value: string) => (value === '' ? null : value) }

export function NuevaFechaModal({
  programId,
  programName,
  academicDate,
  error,
  onSubmit,
  onDelete,
  onClose
}: NuevaFechaModalProps): React.JSX.Element {
  const { t } = useTranslation('fechas')
  const isEditing = academicDate !== undefined

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(createAcademicDateInputSchema),
    defaultValues: {
      programId,
      title: academicDate?.title ?? '',
      // The first kind is the default only for a NEW date: it is the most
      // common trámite, and an empty picker would ask a question the student
      // has no reason to answer before naming the date.
      kind: academicDate?.kind ?? 'inscripcionFinales',
      startsOn: academicDate?.startsOn ?? '',
      endsOn: (academicDate?.endsOn ?? null) as string | null
    }
  })

  const title = isEditing ? t('nuevaFechaModal.editTitle') : t('nuevaFechaModal.createTitle')

  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label={title} onDismiss={onClose}>
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">{title}</h2>
          <p className="text-body-sm text-muted-foreground">
            {isEditing
              ? t('nuevaFechaModal.editSubtitle', { program: programName })
              : t('nuevaFechaModal.createSubtitle', { program: programName })}
          </p>
        </DialogHeader>

        {/* Wrapped rather than `handleSubmit(onSubmit)`: RHF calls its handler
            with `(values, event)`, and forwarding the raw submit event to a
            command callback would put a DOM node in the payload. */}
        <form onSubmit={handleSubmit((values) => onSubmit(values))} className="contents">
          <DialogBody>
            <div className="flex items-end gap-4">
              <Label className="w-[210px] shrink-0">
                {t('nuevaFechaModal.kind')}
                <Select {...register('kind')}>
                  {academicDateKindSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {t(`kinds.${option}`)}
                    </option>
                  ))}
                </Select>
              </Label>
              <p className="pb-3 text-caption leading-relaxed text-muted-foreground">
                <strong className="font-semibold text-secondary-foreground">
                  {t('nuevaFechaModal.kindNoteStrong')}
                </strong>
                {t('nuevaFechaModal.kindNoteRest')}
              </p>
            </div>
            {errors.kind && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.kind.message)}</p>
            )}

            <Label>
              {t('nuevaFechaModal.title')}
              <Input type="text" {...register('title')} />
            </Label>
            {errors.title && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.title.message)}</p>
            )}

            <div className="flex gap-3">
              <Label className="flex-1">
                {t('nuevaFechaModal.from')}
                <Input type="date" {...register('startsOn')} />
              </Label>
              <Label className="flex-1">
                {t('nuevaFechaModal.to')}
                <Input type="date" {...register('endsOn', emptyToNull)} />
              </Label>
            </div>
            {errors.startsOn && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.startsOn.message)}</p>
            )}
            {errors.endsOn && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.endsOn.message)}</p>
            )}

            {/* In the BODY, not the footer (same place EditarCarreraModal puts
                it): the footer's left slot is taken by the delete while
                editing, and a failed save must be reported in both modes. */}
            {error && <p className="text-body-lg text-destructive">{error}</p>}
          </DialogBody>

          {/* Editing and deleting are ONE entry point (same shape as
              EditarCarreraModal/EditarMateriaModal): the card's rows carry no
              delete of their own, so the form that edits a date is where it is
              destroyed. `justify-between` only while there is a left-hand
              action to push away from the footer's buttons. */}
          <DialogFooter className={isEditing && onDelete ? 'justify-between' : undefined}>
            {isEditing && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('nuevaFechaModal.delete')}
              </Button>
            ) : (
              <p className="text-caption text-muted-foreground">{t('nuevaFechaModal.footerNote')}</p>
            )}
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit">
                {isEditing ? t('common:actions.saveChanges') : t('nuevaFechaModal.submitCreate')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogOverlay>
  )
}
