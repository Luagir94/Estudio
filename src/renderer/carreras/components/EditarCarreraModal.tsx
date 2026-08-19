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
import { Calculator, Lock, Trash2 } from 'lucide-react'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { Select } from '../../shared/components/ui/select'
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'
import { ColorSwatchPicker, SUBJECT_COLORS } from '../../shared/components/ColorSwatchPicker'
import {
  type ProgramWithPeriods,
  updateProgramInputSchema,
  type UpdateProgramInput
} from '../../../shared/ipc/carreras'
import { hasRecordedEvaluations } from '../domain/program'

interface EditarCarreraModalProps {
  program: ProgramWithPeriods
  error?: string | null
  onSubmit: (input: UpdateProgramInput) => void
  onDelete: () => void
  onClose: () => void
}

// Same list as NuevaCarreraModal — the scale is a data choice, not a code one.
const SCALES = [
  { value: 10, label: '1 a 10' },
  { value: 20, label: '1 a 20' },
  { value: 100, label: '1 a 100' }
]

export function EditarCarreraModal({
  program,
  error,
  onSubmit,
  onDelete,
  onClose
}: EditarCarreraModalProps): React.JSX.Element {
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
      <DialogContent role="dialog" aria-label="Editar carrera">
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">Editar carrera</h2>
          <p className="text-body-sm text-muted-foreground">Cambiá el nombre, la institución o el color</p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="contents">
          <DialogBody>
            <Label>
              Nombre
              <Input type="text" {...register('name')} />
            </Label>
            {errors.name && <p className="text-body-lg text-destructive">{errors.name.message}</p>}

            <Label>
              Institución
              <Input type="text" {...register('institution')} />
            </Label>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-label font-semibold text-secondary-foreground">COLOR</legend>
              <ColorSwatchPicker value={color} onChange={(next) => setValue('color', next)} />
            </fieldset>

            <span aria-hidden="true" className="h-px w-full bg-border" />

            {locked ? (
              <div className="flex items-start gap-3 rounded-lg border border-border bg-sidebar px-4 py-3">
                <Lock className="mt-px h-4 w-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <strong className="text-body-sm font-semibold text-foreground">
                    El método de evaluación no se puede cambiar
                  </strong>
                  <p className="text-caption leading-relaxed text-secondary-foreground">
                    Esta carrera ya tiene notas cargadas. Cambiar la escala o pasarla a aprobado / desaprobado dejaría
                    esas notas sin significado, así que queda fija en{' '}
                    {program.gradingScheme === 'numerico'
                      ? `numérico, 1 a ${program.gradeScale}`
                      : 'aprobado / desaprobado'}
                    .
                  </p>
                </div>
              </div>
            ) : (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-label font-semibold text-secondary-foreground">MÉTODO DE EVALUACIÓN</legend>
                  <div className="flex w-fit items-center gap-1 rounded-lg border border-border bg-background p-1">
                    {(
                      [
                        ['numerico', 'Numérico'],
                        ['binario', 'Aprobado / Desaprobado']
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
                      Escala
                      <Select {...register('gradeScale', { valueAsNumber: true })}>
                        {SCALES.map((scale) => (
                          <option key={scale.value} value={scale.value}>
                            {scale.label}
                          </option>
                        ))}
                      </Select>
                    </Label>
                    <p className="pb-3 text-caption text-muted-foreground">
                      Todavía se puede cambiar porque no hay ninguna nota cargada.
                    </p>
                  </div>
                )}
                {errors.gradeScale && <p className="text-body-lg text-destructive">{errors.gradeScale.message}</p>}

                <div className="flex items-start gap-3 rounded-lg border border-primary bg-sidebar-accent px-4 py-3">
                  <Calculator className="mt-px h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <strong className="text-body-sm font-semibold text-foreground">
                      {gradingScheme === 'numerico'
                        ? 'Con evaluación numérica la carrera tiene promedio'
                        : 'Sin notas ni promedio'}
                    </strong>
                    <p className="text-caption leading-relaxed text-secondary-foreground">
                      {gradingScheme === 'numerico'
                        ? 'Cada materia lleva nota y vas a ver el promedio con y sin aplazos.'
                        : 'Las materias sólo quedan aprobadas o desaprobadas — es lo típico de un curso con certificado.'}
                    </p>
                  </div>
                </div>
              </>
            )}

            {error && <p className="text-body-lg text-destructive">No se pudo guardar la carrera: {error}</p>}
          </DialogBody>

          <DialogFooter className="justify-between">
            <Button
              type="button"
              variant="ghost"
              className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Eliminar carrera
            </Button>
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
