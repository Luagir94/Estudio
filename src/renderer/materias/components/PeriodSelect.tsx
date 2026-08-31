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
import { useTranslation } from 'react-i18next'
import { Label } from '../../shared/components/ui/label'
import { Select } from '../../shared/components/ui/select'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'

interface PeriodSelectProps {
  programs: ProgramWithPeriods[]
  /** Passed straight from `register('periodId', ...)`. */
  registration: Record<string, unknown>
  /** Whether "Sin período" is an allowed answer. Default true (edit forms). */
  allowNone?: boolean
  /**
   * The invalid-state wiring from `useFieldErrors().bind(...).control`. The
   * `<select>` is nested inside this component, so the form cannot reach it to
   * mark it invalid — the props have to come down.
   */
  control?: { 'aria-invalid'?: 'true'; 'aria-describedby'?: string }
}

export function PeriodSelect({
  programs,
  registration,
  allowNone = true,
  control
}: PeriodSelectProps): React.JSX.Element {
  const { t } = useTranslation('materias')
  const hasPeriods = programs.some((program) => program.periods.length > 0)

  return (
    <div className="flex flex-col gap-2">
      <Label>
        {t('periodSelect.label')}
        <Select disabled={!hasPeriods} {...registration} {...control}>
          {allowNone && <option value="">{t('periodSelect.noPeriodOption')}</option>}
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
        {hasPeriods ? t('periodSelect.helpHasPeriods') : t('periodSelect.helpNoPeriods')}
      </p>
    </div>
  )
}
