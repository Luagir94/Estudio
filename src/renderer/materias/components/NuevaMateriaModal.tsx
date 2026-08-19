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
import { createSubjectInputSchema, type CreateSubjectInput } from '../../../shared/ipc/materias'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import { SlotEditor } from '../../shared/components/SlotEditor'
import { PeriodSelect } from './PeriodSelect'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { ColorSwatchPicker, SUBJECT_COLORS } from '../../shared/components/ColorSwatchPicker'

interface NuevaMateriaModalProps {
  onSubmit: (input: CreateSubjectInput) => void
  onClose: () => void
  /** Programs with their periods, for the período picker. */
  programs?: ProgramWithPeriods[]
  /**
   * Pre-selected período. Resolved by the container via
   * carreras/domain/period.ts's `pickDefaultPeriodId` — subjects are added
   * after their period exists, so the active one is almost always the
   * answer, and it stays visible in the select for the rare time it is not.
   */
  defaultPeriodId?: number | null
}

export function NuevaMateriaModal({
  onSubmit,
  onClose,
  programs = [],
  defaultPeriodId = null
}: NuevaMateriaModalProps): React.JSX.Element {
  // No explicit useForm<T> generic: the zod preprocess fields (docente,
  // contacto) give the resolver an input type that diverges from
  // CreateSubjectInput (the post-parse output type) — letting TypeScript
  // infer TFieldValues from the resolver itself keeps both sides aligned.
  const {
    register,
    handleSubmit,
    control,
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

  if (!hasPeriods) {
    return (
      <DialogOverlay>
        <DialogContent role="dialog" aria-label="Nueva materia">
          <DialogHeader onClose={onClose}>
            <h2 className="font-display text-title font-bold text-foreground">Nueva materia</h2>
            <p className="text-body-sm text-muted-foreground">Primero hace falta un período donde ubicarla</p>
          </DialogHeader>

          <DialogBody>
            <div className="flex items-start gap-3 rounded-lg border border-warn bg-warn-soft px-4 py-3">
              <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <strong className="text-body-sm font-semibold text-foreground">
                  Todavía no tenés ningún período cargado
                </strong>
                <p className="text-caption leading-relaxed text-secondary-foreground">
                  Una materia vive dentro de un período, y de ahí sale a qué carrera pertenece, si la estás cursando y
                  cuándo hay que cerrarla. Creá una carrera y su primer período desde <strong>Carreras</strong>, y
                  volvé.
                </p>
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogOverlay>
    )
  }

  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label="Nueva materia">
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">Nueva materia</h2>
          <p className="text-body-sm text-muted-foreground">Cargala una vez y queda para todo el cuatrimestre</p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="contents">
          <DialogBody>
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
              {/* A fieldset, not a `Label`: this control is six buttons and an
                  input, and a `<label>` can only point at one of them. The
                  legend borrows Label's own classes so the row still reads as
                  one pair of fields. */}
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

            <PeriodSelect programs={programs} registration={register('periodId')} allowNone={false} />
            {errors.periodId && <p className="text-body-lg text-destructive">{errors.periodId.message}</p>}

            <Controller
              name="slots"
              control={control}
              render={({ field }) => <SlotEditor value={field.value} onChange={field.onChange} />}
            />
            {errors.slots && <p className="text-body-lg text-destructive">{errors.slots.message}</p>}
          </DialogBody>

          <DialogFooter className="justify-between">
            <p className="text-caption text-muted-foreground">Podés editar todo después</p>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">Crear materia</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogOverlay>
  )
}
