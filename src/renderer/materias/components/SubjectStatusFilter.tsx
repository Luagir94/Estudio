// Presentational (design node `RR85r`): the status filter chips.
//
// `activas` is the default and means "being taken RIGHT NOW" — a subject in
// standby is not active, it is waiting on a final. Every chip carries its
// count so an empty filter is visibly empty rather than looking broken.
//
// The chip aligns on the BASELINE, not the box centre. Label and count are
// two different type steps (12px / 11px), and `items-center` centres each
// text box independently, which lifts the smaller digit off the label's
// baseline and reads as a superscript. Baseline puts both on one line.
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'
import type { SubjectStatusFilter as FilterValue } from '../domain/subjectStatus'

interface SubjectStatusFilterProps {
  value: FilterValue
  counts: Record<FilterValue, number>
  onChange: (value: FilterValue) => void
}

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'activas', label: 'Activas' },
  { value: 'standby', label: 'Standby' },
  { value: 'aprobadas', label: 'Aprobadas' },
  { value: 'reprobadas', label: 'Reprobadas' },
  { value: 'sinCerrar', label: 'Sin cerrar' },
  { value: 'todas', label: 'Todas' }
]

export function SubjectStatusFilter({ value, counts, onChange }: SubjectStatusFilterProps): React.JSX.Element {
  return (
    <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap items-center gap-2">
      {FILTERS.map((filter) => {
        const isActive = filter.value === value
        return (
          <button
            key={filter.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(filter.value)}
            className={cn(
              isActive
                ? 'flex items-baseline gap-2 rounded-md border border-primary bg-sidebar-accent px-3 py-2 text-body-sm font-semibold text-primary-ink'
                : 'flex items-baseline gap-2 rounded-md border border-border bg-muted px-3 py-2 text-body-sm font-semibold text-secondary-foreground',
              interactiveChip
            )}
          >
            {/* The space is load-bearing: without it the button's accessible
                name reads "Activas1" instead of "Activas 1". */}
            {filter.label}{' '}
            <span className={isActive ? 'text-caption text-primary-ink' : 'text-caption text-muted-foreground'}>
              {counts[filter.value]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
