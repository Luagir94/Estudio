// Presentational form (design §4, node `hjivW` — verified via the Pencil
// MCP tools): React Hook Form + Zod, 2 tabs (General + Horario), reusing
// the shared SlotEditor from slice 2a. campusUrl/notas live HERE ONLY (spec:
// "Subject Field Set" — "accrue later"). This is the aggregate's ONLY other
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
import type { SubjectDetailResult } from '../../../shared/ipc/materias'
import { updateSubjectScheduleInputSchema, type UpdateSubjectScheduleInput } from '../../../shared/ipc/materias'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import { SlotEditor } from '../../shared/components/SlotEditor'
import { PeriodSelect } from './PeriodSelect'
import { cn } from '../../shared/lib/cn'
import { interactive, interactiveChip } from '../../shared/lib/interactive'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { ColorSwatchPicker } from '../../shared/components/ColorSwatchPicker'
import { Textarea } from '../../shared/components/ui/textarea'

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
  /** Programs with their periods, for the período picker. */
  programs?: ProgramWithPeriods[]
}

type Tab = 'general' | 'horario'

export function EditarMateriaModal({
  subject,
  onSubmit,
  onClose,
  onDelete,
  initialTab = 'general',
  programs = []
}: EditarMateriaModalProps): React.JSX.Element {
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
      campusUrl: subject.campusUrl ?? '',
      notas: subject.notas ?? '',
      attendanceMinPercent: subject.attendanceMinPercent,
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
      <DialogContent role="dialog" aria-label="Editar materia" className="max-w-[688px]">
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">Editar materia</h2>
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
            General
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
            Horario
          </button>
        </div>

        {/* Fields for BOTH tabs live inside one form so a single submit sends
            the whole aggregate — tab switching only toggles visibility (RHF
            keeps unmounted field values by default, no shouldUnregister). */}
        <form onSubmit={handleSubmit(onSubmit)} className="contents">
          <DialogBody>
            <div hidden={activeTab !== 'general'} className="flex flex-col gap-4">
              <Label>
                Nombre
                <Input type="text" {...register('name')} />
              </Label>
              {errors.name && <p className="text-body-lg text-destructive">{errors.name.message}</p>}

              <div className="flex gap-4">
                <Label className="w-[170px] shrink-0">
                  Código
                  <Input type="text" {...register('code')} />
                </Label>
                {/* A fieldset, not a `Label`: this control is six buttons and
                    an input, and a `<label>` can only point at one of them.
                    The legend borrows Label's own classes so the row still
                    reads as one pair of fields. */}
                <fieldset className="flex flex-1 flex-col">
                  <legend className="mb-1 block text-body-lg font-medium text-secondary-foreground">Color</legend>
                  <Controller
                    name="color"
                    control={control}
                    render={({ field }) => <ColorSwatchPicker value={field.value} onChange={field.onChange} />}
                  />
                </fieldset>
              </div>
              {errors.code && <p className="text-body-lg text-destructive">{errors.code.message}</p>}
              {errors.color && <p className="text-body-lg text-destructive">{errors.color.message}</p>}

              <Controller
                name="attendanceMinPercent"
                control={control}
                render={({ field }) => {
                  const isRequired = field.value !== null && field.value !== undefined
                  return (
                    <Label>
                      Asistencia
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
                            Libre
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
                            Requiere mínimo
                          </button>
                        </div>
                        {isRequired && (
                          <div className="flex w-24 items-center gap-1 rounded-lg border border-border bg-background px-3 py-3">
                            <input
                              type="number"
                              aria-label="Asistencia mínima (%)"
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

              <div className="h-px w-full bg-border" />

              <div className="flex gap-4">
                <Label className="flex-1">
                  Docente
                  <Input type="text" {...register('docente')} />
                </Label>
                <Label className="flex-1">
                  Contacto
                  <Input type="text" {...register('contacto')} />
                </Label>
              </div>

              <Label>
                Campus virtual (URL)
                <Input type="text" {...register('campusUrl')} />
              </Label>

              <Label>
                Notas
                <Textarea {...register('notas')} />
              </Label>

              <PeriodSelect programs={programs} registration={register('periodId')} />
            </div>

            <div hidden={activeTab !== 'horario'}>
              <Controller
                name="slots"
                control={control}
                render={({ field }) => <SlotEditor value={field.value} onChange={field.onChange} />}
              />
              {errors.slots && <p className="text-body-lg text-destructive">{errors.slots.message}</p>}
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
                Eliminar materia
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">Guardar cambios</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogOverlay>
  )
}
