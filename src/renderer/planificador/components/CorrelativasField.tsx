// Presentational (approved `.pen`): the CORRELATIVAS field, in the "Editar
// materia" modal (`hjivW`) and in the plan map's inspector (`tuJ02`).
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
import { Fragment, useState } from 'react'
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
  /**
   * `compact` is the plan map's 260px inspector, where the two approved designs
   * genuinely diverge: at that width the materia's name loses the line it
   * shares with the select, so the row breaks in two and the box around it goes
   * away — leaving the select as the only bordered thing, because it is the
   * only thing you click. `default` is the modal's 512px field, which has the
   * room and keeps its single line.
   */
  variant?: 'default' | 'compact'
}

const LEVELS: PrerequisiteLevel[] = ['aprobada', 'regularizada']

export function CorrelativasField({
  prerequisites,
  candidates,
  onAdd,
  onChangeLevel,
  onRemove,
  variant = 'default'
}: CorrelativasFieldProps): React.JSX.Element {
  const { t } = useTranslation('materias')
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [pickedSubjectId, setPickedSubjectId] = useState('')
  const [pickedLevel, setPickedLevel] = useState<PrerequisiteLevel>('aprobada')
  const isCompact = variant === 'compact'

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
      <legend
        className={cn(
          'block font-semibold',
          isCompact ? 'text-overline text-muted-foreground' : 'mb-1 text-label text-secondary-foreground'
        )}
      >
        {t('correlativasField.legend')}
      </legend>

      <div className={cn('flex flex-col', isCompact ? 'mt-2.5 gap-2.5' : 'mt-2 gap-2')}>
        {prerequisites.length === 0 && (
          <p className="text-body-sm text-muted-foreground">{t('correlativasField.empty')}</p>
        )}

        {prerequisites.map((prerequisite, index) => (
          <Fragment key={prerequisite.id}>
            {isCompact && index > 0 && <div className="h-px w-full bg-border" aria-hidden />}
            <div
              data-testid="correlativa-field-row"
              className={
                isCompact ? 'flex flex-col gap-1.5' : 'flex items-center gap-3 rounded-lg bg-background px-3 py-2'
              }
            >
              <span
                className={cn(
                  'text-body-sm font-semibold text-foreground',
                  // Compact gets the full width and is allowed to wrap: the
                  // name is WHY the row broke in two, so truncating it here
                  // would throw away exactly what the break bought.
                  // `leading-[1.15]` is the `.pen`'s own value and the theme has
                  // no line-height token for `text-body-sm`; without it the row
                  // runs 4px taller than the approved design.
                  isCompact ? 'w-full leading-[1.15]' : 'min-w-0 flex-1 truncate'
                )}
              >
                {prerequisite.requires.name}
              </span>
              {/* `contents` so the default row stays the flat line it always
                  was — both controls remain direct children of that flex row. */}
              <div className={isCompact ? 'flex items-center justify-between' : 'contents'}>
                <Select
                  aria-label={t('correlativasField.levelLabel', { subject: prerequisite.requires.name })}
                  value={prerequisite.requiredLevel}
                  onChange={(event) =>
                    onChangeLevel({ id: prerequisite.id, requiredLevel: event.target.value as PrerequisiteLevel })
                  }
                  className={cn('w-auto text-body', isCompact ? 'h-6 rounded-md px-2 py-0 font-semibold' : 'h-8')}
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
                    'flex shrink-0 items-center justify-center rounded-md text-secondary-foreground',
                    // No standing fill in compact: removing a correlativa is a
                    // secondary destructive action sharing a 228px line with
                    // the control you actually came for.
                    isCompact ? 'h-[26px] w-[26px]' : 'h-7 w-7 bg-muted',
                    interactiveGhost
                  )}
                >
                  <X className={isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
                </button>
              </div>
            </div>
          </Fragment>
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
              'flex items-center py-1 text-body-sm font-semibold text-primary-ink',
              isCompact ? 'justify-start gap-1' : 'justify-center gap-2',
              interactive,
              'hover:underline hover:underline-offset-2'
            )}
          >
            {t('correlativasField.add')}
            <Plus className={isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
          </button>
        )}
      </div>

      {isCompact ? (
        // ONE voice, behind a divider. In the inspector this note closes a
        // 260px panel, and a bolded half would pull the eye back off the
        // controls it sits under — the divider is what ends the actionable part.
        <>
          <div className="mt-3.5 h-px w-full bg-border" aria-hidden />
          <p className="mt-3.5 text-body-sm text-muted-foreground">
            {t('correlativasField.noteStrong')}
            {t('correlativasField.noteRest')}
          </p>
        </>
      ) : (
        /* Two voices, the same shape the REGULARIDAD hint above uses: what they
           ARE in the strong half, what they DO in the rest. */
        <p className="pt-2 pb-3 text-caption text-muted-foreground">
          <strong className="font-semibold text-secondary-foreground">{t('correlativasField.noteStrong')}</strong>
          {t('correlativasField.noteRest')}
        </p>
      )}
    </fieldset>
  )
}
