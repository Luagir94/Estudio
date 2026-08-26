// Presentational (approved `.pen`): the CORRELATIVAS field inside the "Editar
// materia" modal, after REGULARIDAD and before the divider.
//
// A FIELDSET, never the shared `<Label>` primitive. A `<button>` is a labelable
// element, so a wrapping `<label>` would steal the first button's accessible
// name and announce it as "CORRELATIVAS" — and this field is nothing but
// buttons and selects. The REGULARIDAD field directly above already makes the
// same call for the same reason.
//
// Its writes do NOT ride on the modal's submit. Correlativas have their own
// lifecycle and their own channels (`planificador:*`), the way parciales and
// mesas de final do, so each row change is applied when it is made — see
// `CorrelativasFieldContainer`, which owns the mutations.
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PrerequisiteLevel, SubjectPrerequisite } from '../../../shared/ipc/materias'
import { Button } from '../../shared/components/ui/button'
import { Select } from '../../shared/components/ui/select'
import { cn } from '../../shared/lib/cn'
import { interactive, interactiveGhost } from '../../shared/lib/interactive'

interface CorrelativasFieldProps {
  prerequisites: SubjectPrerequisite[]
  /**
   * The materias this one may be made to require. ALREADY filtered by the
   * container: the subject itself is out, so is anything that already requires
   * it (directly or transitively), and so is anything it already requires. The
   * affordance must never offer an edge the write path would refuse.
   */
  candidates: { id: number; name: string }[]
  onAdd: (input: { requiresSubjectId: number; requiredLevel: PrerequisiteLevel }) => void
  onChangeLevel: (input: { id: number; requiredLevel: PrerequisiteLevel }) => void
  onRemove: (id: number) => void
}

const LEVELS: PrerequisiteLevel[] = ['aprobada', 'regularizada']

export function CorrelativasField({
  prerequisites,
  candidates,
  onAdd,
  onChangeLevel,
  onRemove
}: CorrelativasFieldProps): React.JSX.Element {
  const { t } = useTranslation('materias')
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [pickedSubjectId, setPickedSubjectId] = useState('')
  const [pickedLevel, setPickedLevel] = useState<PrerequisiteLevel>('aprobada')

  function levelLabel(level: PrerequisiteLevel): string {
    return level === 'aprobada' ? t('correlativasField.levelAprobada') : t('correlativasField.levelRegularizada')
  }

  function submitPicked(): void {
    // No materia chosen is not an error to report, it is a click on a control
    // that has nothing to do yet — the placeholder option is still selected.
    if (pickedSubjectId === '') {
      return
    }
    onAdd({ requiresSubjectId: Number(pickedSubjectId), requiredLevel: pickedLevel })
    setIsPickerOpen(false)
    setPickedSubjectId('')
    setPickedLevel('aprobada')
  }

  return (
    <fieldset>
      <legend className="mb-1 block text-label font-semibold text-secondary-foreground">
        {t('correlativasField.legend')}
      </legend>

      <div className="mt-2 flex flex-col gap-2">
        {prerequisites.length === 0 && (
          <p className="text-body-sm text-muted-foreground">{t('correlativasField.empty')}</p>
        )}

        {prerequisites.map((prerequisite) => (
          <div
            key={prerequisite.id}
            data-testid="correlativa-field-row"
            className="flex items-center gap-3 rounded-lg bg-background px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-foreground">
              {prerequisite.requires.name}
            </span>
            <Select
              aria-label={t('correlativasField.levelLabel', { subject: prerequisite.requires.name })}
              value={prerequisite.requiredLevel}
              onChange={(event) =>
                onChangeLevel({ id: prerequisite.id, requiredLevel: event.target.value as PrerequisiteLevel })
              }
              className="h-8 w-auto text-body"
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {levelLabel(level)}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => onRemove(prerequisite.id)}
              aria-label={t('correlativasField.remove', { subject: prerequisite.requires.name })}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-secondary-foreground',
                interactiveGhost
              )}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}

        {candidates.length === 0 ? (
          // The picker excludes the materia itself and every cycle-closing
          // option, so it can legitimately run out — and then saying so beats
          // opening an empty dropdown.
          <p className="text-body-sm text-muted-foreground">{t('correlativasField.noCandidates')}</p>
        ) : isPickerOpen ? (
          <div className="flex items-center gap-3 rounded-lg bg-background px-3 py-2">
            <Select
              aria-label={t('correlativasField.pickerSubject')}
              value={pickedSubjectId}
              onChange={(event) => setPickedSubjectId(event.target.value)}
              className="h-8 min-w-0 flex-1 text-body"
            >
              <option value="">{t('correlativasField.pickerPlaceholder')}</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t('correlativasField.pickerLevel')}
              value={pickedLevel}
              onChange={(event) => setPickedLevel(event.target.value as PrerequisiteLevel)}
              className="h-8 w-auto text-body"
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {levelLabel(level)}
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" onClick={submitPicked} className="h-8 shrink-0 text-body-sm">
              {t('correlativasField.pickerSubmit')}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsPickerOpen(true)}
            className={cn(
              'flex items-center justify-center gap-2 py-1 text-body-sm font-semibold text-primary-ink',
              interactive,
              'hover:underline hover:underline-offset-2'
            )}
          >
            {t('correlativasField.add')}
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* Two voices, the same shape the REGULARIDAD hint above uses: what they
          ARE in the strong half, what they DO in the rest. */}
      <p className="pt-2 pb-3 text-caption text-muted-foreground">
        <strong className="font-semibold text-secondary-foreground">{t('correlativasField.noteStrong')}</strong>
        {t('correlativasField.noteRest')}
      </p>
    </fieldset>
  )
}
