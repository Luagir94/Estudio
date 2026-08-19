// Presentational form (design node `frIjq`, screen "Cerrar materia"):
// records what happened with a subject.
//
// The app NEVER decides this on its own — that is the whole reason this
// screen exists. "Final pendiente" is offered as a first-class answer
// precisely because it is the honest one when nothing is settled yet.
//
// Reached ONLY from the subject detail header (`onCloseSubject`), whatever
// the período's dates say. It used to hang off the Materias list's "sin
// cerrar" banner, which only rendered once a período had ENDED — so a
// promoción could not be recorded during the cursada, and because
// `finalPendiente` is set here, the finales section was unreachable too.
import { Info } from 'lucide-react'
import { useState } from 'react'
import { validateGrade } from '../../../shared/domain/grading'
import type { SubjectOutcome, SubjectWithStatus } from '../../../shared/ipc/materias'

/**
 * Exactly what closing a subject needs, and nothing more.
 *
 * A narrow shape rather than a whole `SubjectWithStatus`: the two screens
 * that can reach this form carry different aggregates — the Materias list
 * holds `SubjectWithStatus`, the detail holds `SubjectDetailResult` (full
 * final-exam records, no `pendingDeadlines`) — and both satisfy this.
 */
export type ClosableSubject = Pick<SubjectWithStatus, 'id' | 'name' | 'outcome' | 'grade' | 'period' | 'program'>
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'

interface CerrarMateriaModalProps {
  subject: ClosableSubject
  onSubmit: (input: { id: number; outcome: SubjectOutcome | null; grade: number | null }) => void
  onClose: () => void
}

const OUTCOMES: { value: SubjectOutcome; label: string; hint: string }[] = [
  { value: 'aprobada', label: 'Aprobada', hint: 'La cerrás acá y no vuelve a aparecer como pendiente.' },
  { value: 'finalPendiente', label: 'Final pendiente', hint: 'Queda en standby y podés cargarle instancias de final.' },
  { value: 'reprobada', label: 'Reprobada', hint: 'Sólo vos podés marcar esto — la app nunca lo hace sola.' }
]

export function CerrarMateriaModal({ subject, onSubmit, onClose }: CerrarMateriaModalProps): React.JSX.Element {
  const [outcome, setOutcome] = useState<SubjectOutcome>(subject.outcome ?? 'aprobada')
  const [grade, setGrade] = useState(subject.grade === null ? '' : String(subject.grade))

  const isNumeric = subject.program?.gradingScheme === 'numerico'
  // A grade needs a SETTLED result under a numeric program — and an aplazo is
  // as settled as a pass. `calculateProgramAverage` has always reported "con
  // aplazos" apart from "sin aplazos", a split that was unreachable while
  // this form offered a grade on `aprobada` only.
  //
  // `finalPendiente` is the one outcome excluded: nothing has happened yet,
  // so there is no number to record.
  const showsGrade = isNumeric && (outcome === 'aprobada' || outcome === 'reprobada')
  const parsedGrade = grade.trim() === '' ? null : Number(grade)

  const gradeError =
    showsGrade && parsedGrade !== null && subject.program
      ? (() => {
          if (Number.isNaN(parsedGrade)) {
            return 'La nota tiene que ser un número'
          }
          const validation = validateGrade(subject.program, parsedGrade)
          return validation.ok ? null : validation.error
        })()
      : null

  const submit = (): void => {
    if (gradeError !== null) {
      return
    }
    onSubmit({ id: subject.id, outcome, grade: showsGrade ? parsedGrade : null })
  }

  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label="Cerrar materia">
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">Cerrar materia</h2>
          <p className="text-body-sm text-muted-foreground">
            {subject.name} · {subject.period?.name ?? 'sin período'}
          </p>
        </DialogHeader>

        <DialogBody>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label font-semibold text-secondary-foreground">¿CÓMO TERMINÓ?</legend>
            <div className="flex flex-col gap-2">
              {OUTCOMES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={outcome === option.value}
                  onClick={() => setOutcome(option.value)}
                  className={cn(
                    outcome === option.value
                      ? 'flex flex-col gap-1 rounded-lg border border-primary bg-sidebar-accent px-4 py-3 text-left'
                      : 'flex flex-col gap-1 rounded-lg border border-border bg-background px-4 py-3 text-left',
                    interactiveChip
                  )}
                >
                  <strong className="text-body font-semibold text-foreground">{option.label}</strong>
                  <span className="text-caption text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {showsGrade && (
            <div className="flex flex-col gap-1">
              <Label className="w-[180px]">
                Nota (0 a {subject.program?.gradeScale}) · opcional
                <Input
                  type="number"
                  value={grade}
                  onChange={(event) => setGrade(event.target.value)}
                  min={0}
                  max={subject.program?.gradeScale ?? undefined}
                />
              </Label>
              {outcome === 'reprobada' && (
                <p className="text-caption text-muted-foreground">
                  Cargala sólo si tu institución registra la nota del aplazo: cuenta en el promedio con aplazos, no en
                  el otro.
                </p>
              )}
            </div>
          )}
          {gradeError && <p className="text-body-lg text-destructive">{gradeError}</p>}

          {!isNumeric && (
            <div className="flex items-start gap-3 rounded-lg bg-muted px-4 py-3">
              <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-body-sm leading-relaxed text-secondary-foreground">
                {subject.program
                  ? 'Esta carrera evalúa aprobado / desaprobado, así que no lleva nota.'
                  : 'Esta materia no pertenece a ninguna carrera todavía, así que no hay escala contra la cual cargar una nota.'}
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <p className="text-caption text-muted-foreground">Podés cambiarlo después</p>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={gradeError !== null}>
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  )
}
