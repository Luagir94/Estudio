// Presentational form (design §4, node `X1dfi`): React Hook Form + Zod,
// reusing the SAME `createPeriodInputSchema` the main-process handler
// validates against.
//
// Reused for BOTH create and edit, the same rule entregas already follows
// ("editing MUST reuse the creation form and its validation schema"): `mode`
// only changes the title/subtitle/submit copy and whether the fields start
// prefilled. The field set never diverges between the two — a period edited
// through a different form would be a second place for the "el año no se
// carga" lesson to go missing.
//
// Two things this screen is deliberately built to TEACH, because the model
// only works if the user shares its assumptions:
//   - there is no "año" field, and the callout says why (it is derived);
//   - an overlap is announced as INFORMATION, never as an error — a period
//     overlapping another is how an annual subject gets its own period.
//
// TIPO AND NOMBRE ARE PICKERS, NOT TEXT. Free text let one carrera hold
// "ddd", "2do cuatri" and "cuatrimestre" at once; the tipo now comes from a
// closed catalogue, and the nombre from the names that tipo derives (see
// carreras/domain/periodKind.ts). The DATES are untouched by this — a tipo
// still defines no date, it only decides how many names there are to choose
// from.
import { zodResolver } from '@hookform/resolvers/zod'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Infinity as InfinityIcon, Layers, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { createPeriodInputSchema, type CreatePeriodInput, type PeriodRecord } from '../../../shared/ipc/carreras'
import { derivePeriodYear, periodsOverlap } from '../domain/period'
import { PERIOD_KINDS, isPeriodKind, periodNameOptions, type PeriodKind } from '../domain/periodKind'
import { translateValidationMessage } from '../../shared/lib/translateValidationMessage'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { Select } from '../../shared/components/ui/select'
import { cn } from '../../shared/lib/cn'
import { interactive } from '../../shared/lib/interactive'

interface NuevoPeriodoModalProps {
  programId: number
  programName: string
  /**
   * The period being edited. Its presence IS the mode — there is no separate
   * `mode` flag that could contradict it, and everything the edit form needs
   * (the values, the id, which period to exclude from the overlap notice)
   * comes from this one object.
   */
  period?: PeriodRecord
  /** Already-existing periods, used only to announce overlaps. */
  existingPeriods: PeriodRecord[]
  /**
   * Why the last submit did not go through. Without this the form just sits
   * there on a failed write and the button reads as broken — which is exactly
   * how a stale preload bridge (no `updatePeriod` on `window.api`) presents
   * itself to the user. Already app-owned Spanish copy
   * (`shared/lib/ipcErrorCopy.ts`) — never the raw IPC message.
   */
  error?: string | null
  onSubmit: (input: CreatePeriodInput) => void
  onClose: () => void
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// `<input type="date">` emits '' when cleared; the schema wants a null.
const emptyToNull = { setValueAs: (value: string) => (value === '' ? null : value) }

export function NuevoPeriodoModal({
  programId,
  programName,
  period,
  existingPeriods,
  error,
  onSubmit,
  onClose
}: NuevoPeriodoModalProps): React.JSX.Element {
  const { t } = useTranslation('carreras')
  const isEditing = period !== undefined
  // An edited open-ended period must open with the checkbox already ticked —
  // otherwise the form would silently offer to give it an end it never had.
  const [isOpenEnded, setIsOpenEnded] = useState(isEditing && period.endsOn === null)

  // A period saved before the catalogue existed holds free text ("clases",
  // "ddd"). Its tipo and nombre open EMPTY rather than mapped to the nearest
  // catalogued value: guessing that "ddd" meant "cuatrimestre" would rename
  // the period on the user's behalf, from a form they only opened to fix a
  // date. Empty asks; a guess decides.
  const storedKind = period?.kind ?? ''
  const catalogued = period !== undefined && isPeriodKind(storedKind)
  const initialKind = isEditing ? (catalogued ? storedKind : '') : 'cuatrimestre'
  const initialName = catalogued && periodNameOptions(storedKind as PeriodKind).includes(period.name) ? period.name : ''

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(createPeriodInputSchema),
    defaultValues: {
      programId,
      name: initialName,
      kind: initialKind as CreatePeriodInput['kind'],
      startsOn: period?.startsOn ?? '',
      endsOn: (period?.endsOn ?? null) as string | null
    }
  })

  const startsOn = watch('startsOn') ?? ''
  const endsOn = watch('endsOn') ?? null
  const kind = watch('kind') ?? ''
  const nameOptions = isPeriodKind(kind) ? periodNameOptions(kind) : []

  // The nombre is only meaningful under its tipo, so changing the tipo drops
  // a name the new one does not offer — leaving "2do cuatrimestre" selected
  // under `mensual` would submit a name that tipo cannot produce, which is
  // the exact inconsistency the pickers exist to prevent.
  const kindField = register('kind')
  const handleKindChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    void kindField.onChange(event)
    const next = event.target.value
    const options = isPeriodKind(next) ? periodNameOptions(next) : []
    if (!options.includes(watch('name'))) {
      setValue('name', '')
    }
  }

  // Named after the period it is describing, so the note reads as being about
  // THIS period rather than as a generic warning.
  const legacyNotice = isEditing && (!catalogued || initialName === '') ? period : null

  const toggleOpenEnded = (checked: boolean): void => {
    setIsOpenEnded(checked)
    if (checked) {
      setValue('endsOn', null)
    }
  }

  const hasValidStart = ISO_DATE.test(startsOn)
  // A partially typed date must not reach the maths — `<input type="date">`
  // reports its value on every keystroke, so half of "2026-08" would parse
  // into nonsense.
  const validEnd = endsOn !== null && ISO_DATE.test(endsOn) ? endsOn : null
  const durationDays =
    hasValidStart && validEnd !== null ? differenceInCalendarDays(parseISO(validEnd), parseISO(startsOn)) + 1 : null

  // A period always overlaps ITSELF, so the one being edited is filtered out
  // here rather than by the caller — a notice saying "se solapa con 1er
  // Cuatrimestre 2026" while editing that very period is noise, not
  // information.
  const overlapping = hasValidStart
    ? existingPeriods
        .filter((candidate) => candidate.id !== period?.id)
        .filter((candidate) => periodsOverlap({ startsOn, endsOn: isOpenEnded ? null : validEnd }, candidate))
    : []

  const title = isEditing ? t('nuevoPeriodoModal.editTitle') : t('nuevoPeriodoModal.createTitle')

  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label={title} onDismiss={onClose}>
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">{title}</h2>
          <p className="text-body-sm text-muted-foreground">
            {isEditing
              ? t('nuevoPeriodoModal.editSubtitle', { program: programName })
              : t('nuevoPeriodoModal.createSubtitle', { program: programName })}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="contents">
          <DialogBody>
            {/* Tipo comes FIRST now: it decides which nombres exist, so
                asking for the name above it would be asking a question whose
                options are not decided yet. */}
            <div className="flex items-end gap-4">
              <Label className="w-[210px] shrink-0">
                {t('nuevoPeriodoModal.kind')}
                <Select {...kindField} onChange={handleKindChange}>
                  <option value="" disabled>
                    {t('nuevoPeriodoModal.kindPlaceholder')}
                  </option>
                  {PERIOD_KINDS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Label>
              <p className="pb-3 text-caption text-muted-foreground">
                <strong className="font-semibold text-secondary-foreground">
                  {t('nuevoPeriodoModal.kindNoteStrong')}
                </strong>
                {t('nuevoPeriodoModal.kindNoteRest')}
              </p>
            </div>
            {errors.kind && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.kind.message)}</p>
            )}

            <Label>
              {t('common:fields.name')}
              <Select {...register('name')} disabled={nameOptions.length === 0}>
                <option value="" disabled>
                  {nameOptions.length === 0
                    ? t('nuevoPeriodoModal.namePlaceholderNoKind')
                    : t('nuevoPeriodoModal.namePlaceholder')}
                </option>
                {nameOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Label>
            {errors.name && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.name.message)}</p>
            )}

            {/* The year is NOT in these names, and this is where the user
                finds that out — otherwise "1er cuatrimestre" reads like the
                app lost the 2026 that used to be there. */}
            {legacyNotice && (
              <p className="rounded-lg bg-muted px-4 py-3 text-caption leading-relaxed text-secondary-foreground">
                {t('nuevoPeriodoModal.legacyNoticeLead')}{' '}
                <strong className="font-semibold text-foreground">{legacyNotice.name}</strong>
                {t('nuevoPeriodoModal.legacyNoticeRest', { kind: legacyNotice.kind })}
              </p>
            )}

            <div className="flex gap-3">
              <Label className="flex-1">
                {t('nuevoPeriodoModal.from')}
                <Input type="date" {...register('startsOn')} />
              </Label>
              <Label className="flex-1">
                {t('nuevoPeriodoModal.to')}
                <Input type="date" disabled={isOpenEnded} {...register('endsOn', emptyToNull)} />
              </Label>
            </div>
            {errors.startsOn && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.startsOn.message)}</p>
            )}
            {errors.endsOn && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.endsOn.message)}</p>
            )}

            {/* `accent-*` matches the entregas checkbox: a checked box is the
                design's violet everywhere, not the OS blue in half the app. */}
            <label className="group flex items-center gap-3">
              <input
                type="checkbox"
                checked={isOpenEnded}
                onChange={(event) => toggleOpenEnded(event.target.checked)}
                className={cn('h-4 w-4 rounded-sm border-border accent-(--color-violet)', interactive)}
              />
              <span className="text-body-sm font-semibold text-secondary-foreground transition-colors duration-150 group-hover:text-foreground">
                {t('nuevoPeriodoModal.openEnded')}
              </span>
              <span className="text-caption text-muted-foreground">{t('nuevoPeriodoModal.openEndedNote')}</span>
            </label>

            {hasValidStart && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3">
                {/* Baseline, not centre: the year and the note beside it are
                    two type steps, and centring each box lifts the smaller one
                    off the shared baseline. The icon has no baseline of its
                    own, so it keeps centring itself. */}
                <span className="flex items-baseline gap-2">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 self-center text-secondary-foreground" aria-hidden="true" />
                  <strong className="text-body-sm font-semibold text-foreground">
                    {t('nuevoPeriodoModal.derivedYear', { year: derivePeriodYear(startsOn) })}
                  </strong>
                  <span className="text-caption text-muted-foreground">{t('nuevoPeriodoModal.derivedYearNote')}</span>
                </span>
                {isOpenEnded ? (
                  <span className="flex items-center gap-2 text-caption text-muted-foreground">
                    <InfinityIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('period.neverEnds')}
                  </span>
                ) : (
                  durationDays !== null && (
                    <span className="text-caption text-muted-foreground">
                      {t('period.duration', { days: durationDays, weeks: Math.round(durationDays / 7) })}
                    </span>
                  )
                )}
              </div>
            )}

            {overlapping.length > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-primary bg-sidebar-accent px-4 py-3">
                <Layers className="mt-px h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <strong className="text-body-sm font-semibold text-foreground">
                    {t('nuevoPeriodoModal.overlapTitle', {
                      names: overlapping.map((candidate) => candidate.name).join(', ')
                    })}
                  </strong>
                  <p className="text-caption leading-relaxed text-secondary-foreground">
                    {t('nuevoPeriodoModal.overlapBody')}
                  </p>
                </div>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            {error ? (
              <p className="text-caption text-destructive">{error}</p>
            ) : (
              <p className="text-caption text-muted-foreground">{t('nuevoPeriodoModal.footerNote')}</p>
            )}
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit">
                {isEditing ? t('common:actions.saveChanges') : t('nuevoPeriodoModal.submitCreate')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogOverlay>
  )
}
