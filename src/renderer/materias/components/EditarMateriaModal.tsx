// Presentational form (design §4, node `hjivW` — verified via the Pencil
// MCP tools): React Hook Form + Zod, 2 tabs (General + Horario), reusing
// the shared SlotEditor from slice 2a. campusUrl/notas — and the ficha de
// cátedra fields comisión/aula/groupUrl — live HERE ONLY (spec: "Subject
// Field Set" — "accrue later"). This is the aggregate's ONLY other
// write path besides create: one submit atomically replaces both the
// general fields AND the whole slot set.
//
// The design's modal footer (`hjivW`/`INZOe`) puts "Eliminar materia" here,
// not as a separate button on the detail screen — the detail screen header
// only ever shows "Editar materia". `onDelete` is optional and only wired
// from the container that owns the delete-confirmation dialog.
import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { SubjectDetailResult } from '../../../shared/ipc/materias'
import { updateSubjectScheduleInputSchema, type UpdateSubjectScheduleInput } from '../../../shared/ipc/materias'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import { SlotEditor } from '../../shared/components/SlotEditor'
import type { BusySpan } from '../../shared/domain/slotOverlap'
import { translateValidationMessage } from '../../shared/lib/translateValidationMessage'
import { PeriodSelect } from './PeriodSelect'
import { cn } from '../../shared/lib/cn'
import { interactive, interactiveChip } from '../../shared/lib/interactive'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { ColorSwatchPicker } from '../../shared/components/ColorSwatchPicker'
import { Textarea } from '../../shared/components/ui/textarea'

// Order matches the approved design (`hjivW`): the undeclared state leads,
// so the control reads as a declaration you make rather than a default the
// app already chose for you.
const REGULARITY_OPTIONS = [
  { value: null, labelKey: 'editarMateriaModal.regularityUndefined' },
  { value: 'regular', labelKey: 'editarMateriaModal.regularityRegular' },
  { value: 'promocionada', labelKey: 'editarMateriaModal.regularityPromocionada' },
  { value: 'libre', labelKey: 'editarMateriaModal.regularityLibre' }
] as const

interface EditarMateriaModalProps {
  subject: SubjectDetailResult
  onSubmit: (input: UpdateSubjectScheduleInput) => void
  onClose: () => void
  /** Opens the delete-confirmation dialog (design: footer's "Eliminar materia"). Omit to hide the action. */
  onDelete?: () => void
  /**
   * Which tab the modal opens on. Defaults to 'general'. Slice 3's Horario
   * grid opens this modal directly on 'horario' when a class block is
   * clicked (spec: "Editing a class routes through the subject").
   */
  initialTab?: Tab
  /** Hours other subjects already occupy, for the slot editor's overlap warning. */
  busySlots?: BusySpan[]
  /** Programs with their periods, for the período picker. */
  programs?: ProgramWithPeriods[]
  /**
   * Injection point for the CORRELATIVAS field (approved `.pen`: after
   * REGULARIDAD, before the divider). `CorrelativasFieldContainer` owns its own
   * mutations and IPC — this component only reserves the slot, exactly as
   * `SubjectDetail` does for `parcialesSlot`/`apuntesSlot`.
   *
   * Its writes deliberately do NOT ride on this form's submit: correlativas
   * have their own lifecycle and their own channels, the way parciales and
   * mesas de final do, so a change there is applied when it is made rather
   * than collected by "Guardar cambios".
   */
  correlativasSlot?: React.ReactNode
}

type Tab = 'general' | 'horario'

export function EditarMateriaModal({
  subject,
  onSubmit,
  onClose,
  onDelete,
  initialTab = 'general',
  busySlots = [],
  programs = [],
  correlativasSlot
}: EditarMateriaModalProps): React.JSX.Element {
  const { t } = useTranslation('materias')
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  // No explicit useForm<T> generic — same reasoning as NuevaMateriaModal:
  // the zod preprocess fields (docente/contacto/campusUrl/notas) give the
  // resolver a pre-parse input type that diverges from
  // UpdateSubjectScheduleInput, and an explicit generic fights that.
  const {
    register,
    handleSubmit,
    control,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(updateSubjectScheduleInputSchema),
    defaultValues: {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      color: subject.color,
      docente: subject.docente ?? '',
      contacto: subject.contacto ?? '',
      comision: subject.comision ?? '',
      aula: subject.aula ?? '',
      campusUrl: subject.campusUrl ?? '',
      groupUrl: subject.groupUrl ?? '',
      notas: subject.notas ?? '',
      attendanceMinPercent: subject.attendanceMinPercent,
      regularity: subject.regularity,
      periodId: subject.periodId,
      slots: subject.slots.map((slot) => ({
        dayOfWeek: slot.dayOfWeek,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        location: slot.location
      }))
    }
  })

  return (
    <DialogOverlay>
      <DialogContent
        role="dialog"
        aria-label={t('editarMateriaModal.dialogLabel')}
        className="max-w-[688px]"
        onDismiss={onClose}
      >
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">{t('editarMateriaModal.title')}</h2>
          <p className="text-body-sm text-muted-foreground">
            {subject.name} · {subject.code}
          </p>
        </DialogHeader>

        <div role="tablist" className="flex gap-1 border-b border-border px-6">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'general'}
            onClick={() => setActiveTab('general')}
            // Tabs skip `interactiveChip`: a ring around a tab reads as a
            // box, and a tab is not one. Its own underline IS the affordance,
            // so hover just previews it on the inactive tab.
            className={cn(
              '-mb-px border-b-2 px-1 py-3 text-body font-semibold',
              interactive,
              activeTab === 'general'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            )}
          >
            {t('editarMateriaModal.generalTab')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'horario'}
            onClick={() => setActiveTab('horario')}
            className={cn(
              'ml-3 -mb-px border-b-2 px-1 py-3 text-body font-semibold',
              interactive,
              activeTab === 'horario'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            )}
          >
            {t('editarMateriaModal.horarioTab')}
          </button>
        </div>

        {/* Fields for BOTH tabs live inside one form so a single submit sends
            the whole aggregate — tab switching only toggles visibility (RHF
            keeps unmounted field values by default, no shouldUnregister). */}
        <form onSubmit={handleSubmit(onSubmit)} className="contents">
          <DialogBody>
            <div hidden={activeTab !== 'general'} className="flex flex-col gap-4">
              <Label>
                {t('common:fields.name')}
                <Input type="text" {...register('name')} />
              </Label>
              {errors.name && (
                <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.name.message)}</p>
              )}

              <div className="flex gap-4">
                <Label className="w-[170px] shrink-0">
                  {t('editarMateriaModal.code')}
                  <Input type="text" {...register('code')} />
                </Label>
                {/* A fieldset, not a `Label`: this control is six buttons and
                    an input, and a `<label>` can only point at one of them.
                    The legend borrows Label's own classes so the row still
                    reads as one pair of fields. */}
                <fieldset className="flex flex-1 flex-col">
                  <legend className="mb-1 block text-label font-semibold text-secondary-foreground">
                    {t('editarMateriaModal.colorLegend')}
                  </legend>
                  <Controller
                    name="color"
                    control={control}
                    render={({ field }) => <ColorSwatchPicker value={field.value} onChange={field.onChange} />}
                  />
                </fieldset>
              </div>
              {errors.code && (
                <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.code.message)}</p>
              )}
              {errors.color && (
                <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.color.message)}</p>
              )}

              <Controller
                name="attendanceMinPercent"
                control={control}
                render={({ field }) => {
                  const isRequired = field.value !== null && field.value !== undefined
                  return (
                    <Label>
                      {t('editarMateriaModal.attendance')}
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
                          <button
                            type="button"
                            onClick={() => field.onChange(null)}
                            className={cn(
                              'rounded-md px-3 py-2 text-body-sm font-semibold',
                              !isRequired ? 'bg-primary text-white' : 'text-secondary-foreground',
                              interactiveChip
                            )}
                          >
                            {t('editarMateriaModal.attendanceFree')}
                          </button>
                          <button
                            type="button"
                            onClick={() => field.onChange(subject.attendanceMinPercent ?? 75)}
                            className={cn(
                              'rounded-md px-3 py-2 text-body-sm font-semibold',
                              isRequired ? 'bg-primary text-white' : 'text-secondary-foreground',
                              interactiveChip
                            )}
                          >
                            {t('editarMateriaModal.attendanceRequiresMin')}
                          </button>
                        </div>
                        {isRequired && (
                          <div className="flex w-24 items-center gap-1 rounded-lg border border-border bg-background px-3 py-3">
                            <input
                              type="number"
                              aria-label={t('editarMateriaModal.minAttendanceInput')}
                              value={field.value == null ? '' : String(field.value)}
                              onChange={(event) =>
                                field.onChange(event.target.value === '' ? null : Number(event.target.value))
                              }
                              className="w-full bg-transparent text-body font-semibold text-foreground outline-none"
                            />
                            <span className="text-body text-muted-foreground">%</span>
                          </div>
                        )}
                      </div>
                    </Label>
                  )
                }}
              />

              {/* The condición is DECLARED, never derived. Every cátedra promotes on
                  its own rules (con 7, con 8, con asistencia, sin ella), so the app
                  records the facultad's verdict instead of computing one. "Sin
                  definir" is a first-class state, not an empty placeholder. */}
              <Controller
                name="regularity"
                control={control}
                render={({ field }) => (
                  <>
                    <fieldset>
                      <legend className="mb-1 block text-label font-semibold text-secondary-foreground">
                        {t('editarMateriaModal.regularity')}
                      </legend>
                      <div className="mt-2 flex w-fit gap-1 rounded-lg border border-border bg-background p-1">
                        {REGULARITY_OPTIONS.map((option) => (
                          <button
                            key={option.labelKey}
                            type="button"
                            aria-pressed={field.value === option.value}
                            onClick={() => field.onChange(option.value)}
                            className={cn(
                              'rounded-md px-3 py-2 text-body-sm font-semibold',
                              field.value === option.value ? 'bg-primary text-white' : 'text-secondary-foreground',
                              interactiveChip
                            )}
                          >
                            {t(option.labelKey)}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <p className="pb-3 text-caption text-muted-foreground">
                      <strong className="font-semibold text-secondary-foreground">
                        {t('editarMateriaModal.regularityNoteStrong')}
                      </strong>
                      {t('editarMateriaModal.regularityNoteRest')}
                    </p>
                  </>
                )}
              />

              {correlativasSlot}

              <div className="h-px w-full bg-border" />

              <div className="flex gap-4">
                <Label className="flex-1">
                  {t('editarMateriaModal.teacher')}
                  <Input type="text" {...register('docente')} />
                </Label>
                <Label className="flex-1">
                  {t('editarMateriaModal.contact')}
                  <Input type="text" {...register('contacto')} />
                </Label>
              </div>

              <div className="flex gap-4">
                <Label className="flex-1">
                  {t('editarMateriaModal.comision')}
                  <Input type="text" {...register('comision')} />
                </Label>
                <Label className="flex-1">
                  {t('editarMateriaModal.aula')}
                  <Input type="text" {...register('aula')} />
                </Label>
              </div>

              <Label>
                {t('editarMateriaModal.campusUrl')}
                <Input type="text" {...register('campusUrl')} />
              </Label>

              <Label>
                {t('editarMateriaModal.groupUrl')}
                <Input type="text" {...register('groupUrl')} />
              </Label>

              <Label>
                {t('editarMateriaModal.notes')}
                <Textarea {...register('notas')} />
              </Label>

              <PeriodSelect programs={programs} registration={register('periodId')} />
            </div>

            <div hidden={activeTab !== 'horario'}>
              <Controller
                name="slots"
                control={control}
                render={({ field }) => (
                  <SlotEditor value={field.value} onChange={field.onChange} busySlots={busySlots} />
                )}
              />
              {errors.slots && (
                <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.slots.message)}</p>
              )}
            </div>
          </DialogBody>

          <DialogFooter className="justify-between">
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {t('editarMateriaModal.deleteSubject')}
              </Button>
            ) : (
              <span />
            )}
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
