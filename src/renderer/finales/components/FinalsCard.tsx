// Presentational (design nodes `grfpH` / `g1HRM2` / `vYdru`): the final-exam
// instances, the standby strip and the decision prompt.
//
// The prompt is the point of this component. Failing every mesa leaves the
// subject in standby FOREVER unless the app says so — the state is derived,
// so nothing changes on its own, and without this the subject would sit
// there silently with no signal that a decision is owed.
import { Calendar, CalendarOff, Info, Pause, Plus, Trash2 } from 'lucide-react'
import { countFinalsByResult, resolveFinalsVerdict, type FinalExamResult } from '../../materias/domain/subjectStatus'
import { Button } from '../../shared/components/ui/button'
import { cn } from '../../shared/lib/cn'
import { interactiveChip, interactiveGhostDestructive } from '../../shared/lib/interactive'
import type { FinalExamRecord } from '../../../shared/ipc/materias'

interface FinalsCardProps {
  finals: FinalExamRecord[]
  onAdd: () => void
  onSetResult: (final: FinalExamRecord, result: FinalExamResult) => void
  onDelete: (final: FinalExamRecord) => void
  /** Records the subject as reprobada — only the student may do this. */
  onGiveUp: () => void
}

const RESULT_LABELS: Record<FinalExamResult, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  reprobado: 'Reprobado'
}

const RESULT_STYLES: Record<FinalExamResult, string> = {
  pendiente: 'border-border bg-muted text-secondary-foreground',
  aprobado: 'border-ok bg-ok-soft text-ok',
  reprobado: 'border-destructive bg-urgent-soft text-destructive'
}

const RESULTS: FinalExamResult[] = ['pendiente', 'aprobado', 'reprobado']

export function FinalsCard({ finals, onAdd, onSetResult, onDelete, onGiveUp }: FinalsCardProps): React.JSX.Element {
  const counts = countFinalsByResult(finals)
  const verdict = resolveFinalsVerdict(finals)

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-md border border-primary bg-sidebar-accent px-3 py-2">
            <Pause className="h-3.5 w-3.5 text-primary-ink" aria-hidden="true" />
            <strong className="text-body-sm font-semibold text-primary-ink">
              {verdict === 'aprobado' ? 'Aprobada por final' : 'Standby — final pendiente'}
            </strong>
          </span>
          <ul className="flex items-center gap-2">
            {RESULTS.map((result) => (
              <li
                key={result}
                className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-caption text-secondary-foreground"
              >
                {counts[result]} {RESULT_LABELS[result].toLowerCase()}
                {counts[result] === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-body-sm leading-relaxed text-secondary-foreground">
          Aprobás cualquier instancia y la materia queda Aprobada sola — aprobar es inequívoco. Si las reprobás todas,
          sigue en standby: darla por reprobada es una decisión tuya, la app nunca la cierra por vos.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-label font-semibold text-muted-foreground">INSTANCIAS DE FINAL</h2>
          <Button type="button" size="sm" onClick={onAdd} className="gap-2">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Agregar instancia
          </Button>
        </div>

        {finals.length === 0 ? (
          <p className="text-body-lg text-muted-foreground">
            Todavía no anotaste ninguna mesa. Podés cargarla aunque no sepas la fecha.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {finals.map((final) => (
              <li
                key={final.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-4 py-3"
              >
                <strong className="flex-1 text-body font-semibold text-foreground">{final.label}</strong>

                <span className="flex w-[190px] items-center gap-2 text-body-sm">
                  {final.takenOn === null ? (
                    <>
                      <CalendarOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <span className="text-muted-foreground">Sin fecha todavía</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <span className="text-secondary-foreground">{final.takenOn}</span>
                    </>
                  )}
                </span>

                <span className="flex items-center gap-1">
                  {RESULTS.map((result) => (
                    <button
                      key={result}
                      type="button"
                      aria-pressed={final.result === result}
                      onClick={() => onSetResult(final, result)}
                      className={cn(
                        final.result === result
                          ? `rounded-md border px-2 py-1 text-caption font-semibold ${RESULT_STYLES[result]}`
                          : 'rounded-md border border-transparent px-2 py-1 text-caption font-medium text-muted-foreground',
                        interactiveChip
                      )}
                    >
                      {RESULT_LABELS[result]}
                    </button>
                  ))}
                </span>

                <button
                  type="button"
                  aria-label={`Borrar ${final.label}`}
                  onClick={() => onDelete(final)}
                  className={cn('-m-2 rounded-md p-2 text-muted-foreground', interactiveGhostDestructive)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {verdict === 'todasReprobadas' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn bg-warn-soft px-4 py-3">
          <span className="flex items-start gap-3">
            <Info className="mt-px h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
            <span className="flex flex-col gap-1">
              <strong className="text-body-sm font-semibold text-foreground">
                Reprobaste {finals.length === 1 ? 'la instancia' : `las ${finals.length} instancias`} y no queda ninguna
                abierta
              </strong>
              <span className="text-caption text-secondary-foreground">
                La materia sigue en standby hasta que vos decidas. Siempre podés anotar otra mesa.
              </span>
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onAdd}>
              Agregar otra mesa
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={onGiveUp}>
              Darla por reprobada
            </Button>
          </span>
        </div>
      )}
    </section>
  )
}
