// Presentational: the período picker shared by the create and edit subject
// forms (design node `D7hoY`).
//
// Options are grouped by carrera because two carreras can legitimately both
// have a "1er Cuatrimestre 2026" — the group is what tells them apart, and a
// flat list would make the choice ambiguous.
//
// "Sin período" is offered ONLY when editing (`allowNone`). On creation it
// is not: a subject born without a period belongs to no carrera, can never
// leave the "cursando" status, and counts toward no average — a trap that
// looks like a normal row. Editing keeps the option because a subject can
// legitimately become orphaned when its period is deleted, and you need a
// way to see and fix that.
import { Label } from '../../shared/components/ui/label'
import { Select } from '../../shared/components/ui/select'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'

interface PeriodSelectProps {
  programs: ProgramWithPeriods[]
  /** Passed straight from `register('periodId', ...)`. */
  registration: Record<string, unknown>
  /** Whether "Sin período" is an allowed answer. Default true (edit forms). */
  allowNone?: boolean
}

export function PeriodSelect({ programs, registration, allowNone = true }: PeriodSelectProps): React.JSX.Element {
  const hasPeriods = programs.some((program) => program.periods.length > 0)

  return (
    <div className="flex flex-col gap-2">
      <Label>
        Período
        <Select disabled={!hasPeriods} {...registration}>
          {allowNone && <option value="">Sin período</option>}
          {programs.map((program) => (
            <optgroup key={program.id} label={program.name}>
              {program.periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Label>
      <p className="text-caption text-muted-foreground">
        {hasPeriods
          ? 'Define de qué carrera es la materia, si está activa, y cuándo hay que cerrarla.'
          : 'Todavía no cargaste ningún período. Creá uno desde Carreras para poder ubicar la materia en el tiempo.'}
      </p>
    </div>
  )
}
