// Presentational (design node `TfFjk` — "Screen — Período (detalle)"): the
// screen a period row opens.
//
// This screen exists because a period row used to answer the wrong question.
// Clicking it opened the edit form, so "what is inside this cuatrimestre?"
// — the thing you actually want to know when you look at a period — had no
// answer anywhere in the app. Editing moved to the pencil in the row and to
// the button in this header, and the row body now does what a row body does
// everywhere else in this app: it opens the thing.
//
// No data fetching and no `new Date()`: `now` arrives as a prop, same rule as
// MateriasList — a component that reads the clock itself cannot be tested
// against a fixed day.
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ChevronLeft, Pencil, Plus } from 'lucide-react'
import type { PeriodRecord } from '../../../shared/ipc/carreras'
import type { SubjectWithStatus } from '../../../shared/ipc/materias'
import { MateriasList } from '../../materias/components/MateriasList'
import { Button } from '../../shared/components/ui/button'
import { cn } from '../../shared/lib/cn'
import { interactiveGhost } from '../../shared/lib/interactive'
import { derivePeriodYear, formatPeriodRange, isOpenEnded, periodStatus, type PeriodStatus } from '../domain/period'

interface PeriodDetailProps {
  period: PeriodRecord
  programName: string
  programColor: string
  /** The subjects recorded under THIS period. */
  subjects: SubjectWithStatus[]
  now: Date
  onBack: () => void
  onEdit: () => void
  onAddSubject: () => void
  /** Opens a subject's detail, which lives in the Materias screen. */
  onOpenSubject?: (id: number) => void
}

const STATUS_LABELS: Record<PeriodStatus, string> = {
  activo: 'Activo',
  finalizado: 'Finalizado',
  proximo: 'Próximo'
}

const STATUS_STYLES: Record<PeriodStatus, string> = {
  activo: 'border-primary bg-sidebar-accent text-primary-ink',
  finalizado: 'border-border bg-muted text-muted-foreground',
  proximo: 'border-border bg-muted text-secondary-foreground'
}

/**
 * Both boundaries are inclusive — the first and last day of a cuatrimestre
 * are days you are cursando — so the count is the difference PLUS ONE.
 *
 * An open-ended period has no duration to state. It reads "No termina"
 * rather than a number counted from today, which would be a different fact
 * (how long it has run) wearing the label of this one.
 */
function formatDuration(period: PeriodRecord): string {
  if (isOpenEnded(period)) {
    return 'No termina'
  }
  const days = differenceInCalendarDays(parseISO(period.endsOn as string), parseISO(period.startsOn)) + 1
  return `${days} días · ${Math.round(days / 7)} semanas`
}

/**
 * The design splits the two uppercase steps by JOB, not by size:
 * `text-label` (11/0.3) names a section or a field, `text-overline` (10/0.9)
 * heads a table COLUMN. This cell names fields, so it is `text-label` —
 * matching every other field label in the app (HoyDashboard's "CLASES DE
 * HOY", SubjectDetail's "HORARIO SEMANAL", PeriodTimeline's "LÍNEA DE
 * TIEMPO"). It used `text-overline` and was the only place that did.
 */
function MetaCell({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="flex flex-col gap-1">
      <span className="text-label font-semibold text-muted-foreground">{label}</span>
      {children}
    </span>
  )
}

function MetaValue({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="text-body font-semibold text-foreground">{children}</span>
}

export function PeriodDetail({
  period,
  programName,
  programColor,
  subjects,
  now,
  onBack,
  onEdit,
  onAddSubject,
  onOpenSubject
}: PeriodDetailProps): React.JSX.Element {
  const status = periodStatus(period, now)

  return (
    <div className="flex flex-col gap-5">
      {/* Back goes to the CARRERA, not to the carreras list: this screen was
          opened from one period's row, so the way out is the screen that row
          was on. */}
      <button
        type="button"
        onClick={onBack}
        className={cn(
          '-mx-2 flex w-fit items-center gap-2 rounded-md px-2 py-1 text-body-sm text-muted-foreground',
          interactiveGhost
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {programName}
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              style={{ backgroundColor: programColor }}
              className="h-[34px] w-[3px] shrink-0 rounded-sm"
            />
            <h1 className="font-display text-display-lg font-bold text-foreground">{period.name}</h1>
          </div>
          {/* The same sentence the periods table prints, for the same reason:
              it is the app explaining why no screen ever asked for a year. */}
          <p className="text-body text-secondary-foreground">
            {programName} · año {derivePeriodYear(period.startsOn)} · derivado de la fecha de inicio
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button type="button" variant="outline" onClick={onEdit} className="gap-2">
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Editar período
          </Button>
          <Button type="button" onClick={onAddSubject} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar materia
          </Button>
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-border bg-card px-5 py-4">
        {/* Plain text, not a badge. The design badges ESTADO and only ESTADO,
            and that is a distinction worth keeping: a status is something the
            period IS RIGHT NOW and changes on its own as dates pass, so it
            earns a coloured pill. The kind is a flat fact that never moves.
            Badging both says they are the same kind of thing. */}
        <MetaCell label="TIPO">
          <MetaValue>{period.kind}</MetaValue>
        </MetaCell>
        <MetaCell label="FECHAS">
          <MetaValue>{formatPeriodRange(period.startsOn, period.endsOn)}</MetaValue>
        </MetaCell>
        <MetaCell label="DURACIÓN">
          <MetaValue>{formatDuration(period)}</MetaValue>
        </MetaCell>
        <MetaCell label="MATERIAS">
          <MetaValue>
            {subjects.length} materia{subjects.length === 1 ? '' : 's'}
          </MetaValue>
        </MetaCell>
        <MetaCell label="ESTADO">
          <span className={`w-fit rounded-md border px-2 py-1 text-caption font-semibold ${STATUS_STYLES[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        </MetaCell>
      </section>

      <div className="flex flex-col gap-3">
        <h2 className="text-label font-semibold text-muted-foreground">MATERIAS DE ESTE PERÍODO</h2>
        <MateriasList
          subjects={subjects}
          now={now}
          onSelect={onOpenSubject}
          emptyMessage="Este período todavía no tiene materias."
        />
      </div>

      <p className="text-caption leading-relaxed text-muted-foreground">
        Una materia pertenece a UN período. Si borrás este período sus materias no se borran: quedan sin período hasta
        que las asignes a otro.
      </p>
    </div>
  )
}
