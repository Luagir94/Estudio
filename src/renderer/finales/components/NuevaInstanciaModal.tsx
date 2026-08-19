// Presentational form (design node `DyF1c`): adds one final-exam instance.
//
// The date field carries an explicit "opcional" badge and an empty
// placeholder because that is the whole point: you can write down a mesa
// before the institution publishes its calendar.
import { zodResolver } from '@hookform/resolvers/zod'
import { Pause } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { createFinalExamInputSchema, type CreateFinalExamInput } from '../../../shared/ipc/finales'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { Select } from '../../shared/components/ui/select'

interface NuevaInstanciaModalProps {
  subjectId: number
  subjectName: string
  onSubmit: (input: CreateFinalExamInput) => void
  onClose: () => void
}

export function NuevaInstanciaModal({
  subjectId,
  subjectName,
  onSubmit,
  onClose
}: NuevaInstanciaModalProps): React.JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(createFinalExamInputSchema),
    defaultValues: { subjectId, label: '', takenOn: null as string | null, result: 'pendiente' as const }
  })

  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label="Nueva instancia de final">
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">Nueva instancia de final</h2>
          <p className="text-body-sm text-muted-foreground">{subjectName}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="contents">
          <DialogBody>
            <Label>
              Nombre de la mesa
              <Input type="text" placeholder="3ra mesa — Turno diciembre" {...register('label')} />
            </Label>
            {errors.label && <p className="text-body-lg text-destructive">{errors.label.message}</p>}

            <div className="flex flex-col gap-2">
              <Label>
                <span className="flex items-center gap-2">
                  Fecha
                  <span className="rounded-md bg-muted px-2 py-px text-micro font-semibold text-muted-foreground">
                    opcional
                  </span>
                </span>
                <Input
                  type="date"
                  {...register('takenOn', { setValueAs: (value: string) => (value === '' ? null : value) })}
                />
              </Label>
              <p className="text-caption text-muted-foreground">
                Dejala vacía si la institución todavía no publicó el calendario. La cargás después y listo.
              </p>
            </div>
            {errors.takenOn && <p className="text-body-lg text-destructive">{errors.takenOn.message}</p>}

            <Label className="w-[200px]">
              Resultado
              <Select {...register('result')}>
                <option value="pendiente">Pendiente</option>
                <option value="aprobado">Aprobado</option>
                <option value="reprobado">Reprobado</option>
              </Select>
            </Label>

            <div className="flex items-start gap-3 rounded-lg border border-primary bg-sidebar-accent px-4 py-3">
              <Pause className="mt-px h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
              <p className="text-caption leading-relaxed text-secondary-foreground">
                Al guardarla, la materia vuelve a standby esperando esta mesa. No se pisa ningún resultado anterior.
              </p>
            </div>
          </DialogBody>

          <DialogFooter>
            <p className="text-caption text-muted-foreground">Podés cargar todas las mesas que necesites</p>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">Agregar instancia</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogOverlay>
  )
}
