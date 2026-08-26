// Presentational (design §4, approved `.pen` — the whole Planificador
// screen). Two columns inside the standard Main shell: DISPONIBLES PARA CURSAR
// on the left, TU BORRADOR on the right.
//
// Every verdict on this screen arrives as a prop. Eligibility, clashes and the
// weekly load are resolved by the pure domain (`domain/requirements.ts`,
// `domain/draftSchedule.ts`) and the container passes the answers down — this
// file only decides how they look.
//
// The one behaviour worth stating out loud, because it is easy to "fix" into a
// bug: THE CLASH NOTICE BLOCKS NOTHING. It never hides a row, never takes the
// × away, and never withholds the + from a materia that would collide. Its own
// approved copy is the specification — "el planificador avisa, no decide" —
// and the tests hold that line.
import { Lock, Plus, TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toMondayFirstIndex } from '../../shared/domain/dayOfWeek'
import { cn } from '../../shared/lib/cn'
import { interactive, interactiveGhost } from '../../shared/lib/interactive'
import { DotBadge } from '../../shared/components/ui/dot-badge'
import { Select } from '../../shared/components/ui/select'
import { type DraftSubject, type ScheduleClash, weeklyLoadFraction, type WeeklyLoad } from '../domain/draftSchedule'
import type { PlannablePeriod } from '../domain/plannablePeriods'
import type { Candidate, UnmetRequirement } from '../domain/requirements'

interface PlanificadorScreenProps {
  /** Every período still worth planning, in switcher order. Empty = nothing to plan. */
  periods: PlannablePeriod[]
  selectedPeriodId: number | null
  onSelectPeriod: (periodId: number) => void
  /** Already filtered and judged by `listCandidates` — this component adds no rule of its own. */
  candidates: Candidate[]
  draft: DraftSubject[]
  clashes: ScheduleClash[]
  load: WeeklyLoad
  onAdd: (subjectId: number) => void
  onRemove: (subjectId: number) => void
}

// A seventh local copy of the same three lines, matching the convention every
// other row component in this app follows (HorarioGrid, ClassRow, MateriasList,
// SubjectDetail, HoyDashboard, ClaseModal). Extracting it is a repo-wide
// consolidation, not this feature's business.
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const mins = (minutes % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

// Number part only — the "{{value}} h" wrapping is the locale's business (same
// split `SubjectDetail.formatWeeklyHoursValue` makes).
function formatHoursValue(totalMinutes: number): string {
  const rounded = Math.round((totalMinutes / 60) * 10) / 10
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
}

/**
 * "Lun y Mié", "Lun, Mié y Vie" — through `Intl.ListFormat`, not a hand-rolled
 * join. The conjunction and the comma placement are locale rules, and the
 * platform already knows them; a catalog key for "y" would be this app
 * re-implementing Spanish.
 */
function formatDayList(labels: string[], locale: string): string {
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(labels)
}

/** Unique weekday labels for a subject's slots, in the order the week runs. */
function dayLabels(slots: { dayOfWeek: number }[], weekdays: string[]): string[] {
  const indexes = [...new Set(slots.map((slot) => toMondayFirstIndex(slot.dayOfWeek)))].sort((a, b) => a - b)
  return indexes.map((index) => weekdays[index] ?? '')
}

const ROW_SHELL = 'flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3'
const ICON_BUTTON = 'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-muted'

export function PlanificadorScreen({
  periods,
  selectedPeriodId,
  onSelectPeriod,
  candidates,
  draft,
  clashes,
  load,
  onAdd,
  onRemove
}: PlanificadorScreenProps): React.JSX.Element {
  const { t, i18n } = useTranslation('planificador')
  const weekdaysShort = t('common:weekdaysShort3', { returnObjects: true }) as string[]
  const weekdaysLong = t('common:weekdaysLong', { returnObjects: true }) as string[]
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId) ?? null
  // Derived from the clashes rather than passed alongside them: one source,
  // so a row can never be painted urgent without a notice explaining why.
  const clashingSubjectIds = new Set(clashes.flatMap((clash) => [clash.first.id, clash.second.id]))

  function missingLine(unmet: UnmetRequirement): string {
    if (unmet.subjectName === null) {
      return t('candidates.missingUnknownSubject')
    }
    return t('candidates.missing', {
      subject: unmet.subjectName,
      level: t(`levels.${unmet.requiredLevel}`)
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-display-lg font-bold text-foreground">{t('container.title')}</h1>
          <p className="text-body text-secondary-foreground">
            {t('container.subtitle', {
              period: selectedPeriod?.name ?? '',
              drafted: t('container.draftedCount', { count: load.subjectCount }),
              hours: formatHoursValue(load.totalMinutes)
            })}
          </p>
        </div>
        {/* A native <select>, not a button plus a popover menu. This app's
            Select primitive documents the same call for the same reason: a
            single-choice dropdown gets full keyboard and screen-reader
            behaviour for free, and a hand-built listbox would be re-earning it
            with focus-management code. Styled to the design's outline button. */}
        {periods.length > 0 && (
          <Select
            aria-label={t('periodSwitcher.label')}
            value={selectedPeriodId ?? ''}
            onChange={(event) => onSelectPeriod(Number(event.target.value))}
            className="w-auto border-border bg-card px-4 text-body font-semibold"
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {t('periodSwitcher.option', { period: period.name, program: period.programName })}
              </option>
            ))}
          </Select>
        )}
      </header>

      {periods.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <p className="text-body-lg font-semibold text-foreground">{t('container.noPeriodsTitle')}</p>
          <p className="text-body-sm text-secondary-foreground">{t('container.noPeriodsBody')}</p>
        </div>
      ) : (
        // The design's responsive rule, borrowed verbatim from the subject
        // detail's right rail: below 820px the two columns stack.
        <div className="flex flex-col gap-6 min-[820px]:flex-row">
          <section aria-label={t('candidates.heading')} className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 className="text-label font-semibold text-muted-foreground">{t('candidates.heading')}</h2>
            {candidates.length === 0 && <p className="text-body-lg text-muted-foreground">{t('candidates.empty')}</p>}
            {candidates.map(({ subject, state, unmet }) => {
              const days = dayLabels(subject.slots, weekdaysShort)
              const weeklyMinutes = subject.slots.reduce(
                (total, slot) => total + (slot.endMinutes - slot.startMinutes),
                0
              )
              return (
                <div key={subject.id} data-testid="planificador-candidate" className={ROW_SHELL}>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-body-lg font-semibold text-foreground">{subject.name}</span>
                    <span className="text-body-sm text-muted-foreground">
                      {days.length === 0
                        ? t('candidates.metaNoSchedule', { code: subject.code })
                        : t('candidates.meta', {
                            code: subject.code,
                            hours: formatHoursValue(weeklyMinutes),
                            days: formatDayList(days, i18n.language)
                          })}
                    </span>
                    {/* One line per unmet requirement, in urgent: "Bloqueada"
                        on its own tells the student nothing they can act on. */}
                    {unmet.map((requirement) => (
                      <span
                        key={`${requirement.subjectId}-${requirement.requiredLevel}`}
                        className="text-body-sm font-semibold text-destructive"
                      >
                        {missingLine(requirement)}
                      </span>
                    ))}
                  </div>
                  <div className="flex w-[110px] shrink-0 justify-end">
                    <DotBadge tone={state === 'habilitada' ? 'ok' : 'urgent'}>{t(`candidates.${state}`)}</DotBadge>
                  </div>
                  {state === 'habilitada' ? (
                    <button
                      type="button"
                      onClick={() => onAdd(subject.id)}
                      aria-label={t('candidates.add', { subject: subject.name })}
                      className={cn(ICON_BUTTON, 'text-primary-ink', interactive, 'hover:bg-sidebar-accent')}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                    </button>
                  ) : (
                    // NOT a disabled button: there is nothing to click, so
                    // there is nothing to tab into either. The badge beside it
                    // already carries the state for a screen reader, which is
                    // why the lock itself is decorative.
                    <span
                      data-testid="planificador-candidate-lock"
                      aria-hidden="true"
                      className={cn(ICON_BUTTON, 'text-muted-foreground opacity-50')}
                    >
                      <Lock className="h-4 w-4" />
                    </span>
                  )}
                </div>
              )
            })}
          </section>

          <section
            aria-label={t('draft.heading')}
            className="flex w-full flex-col gap-2 min-[820px]:w-[420px] min-[820px]:shrink-0"
          >
            <h2 className="text-label font-semibold text-muted-foreground">{t('draft.heading')}</h2>
            {draft.length === 0 && <p className="text-body-lg text-muted-foreground">{t('draft.empty')}</p>}
            {draft.map((subject) => {
              const clashing = clashingSubjectIds.has(subject.id)
              return (
                <div
                  key={subject.id}
                  data-testid="planificador-draft-row"
                  className={cn(ROW_SHELL, clashing && 'border-destructive')}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-body-lg font-semibold text-foreground">{subject.name}</span>
                    <span
                      className={cn(
                        'text-body-sm',
                        clashing ? 'font-semibold text-destructive' : 'text-muted-foreground'
                      )}
                    >
                      {subject.slots.length === 0
                        ? t('draft.noSchedule')
                        : [...subject.slots]
                            .sort(
                              (a, b) =>
                                toMondayFirstIndex(a.dayOfWeek) - toMondayFirstIndex(b.dayOfWeek) ||
                                a.startMinutes - b.startMinutes
                            )
                            .map((slot) =>
                              t('draft.slot', {
                                day: weekdaysShort[toMondayFirstIndex(slot.dayOfWeek)],
                                start: formatTime(slot.startMinutes),
                                end: formatTime(slot.endMinutes)
                              })
                            )
                            .join(' · ')}
                    </span>
                  </div>
                  {/* Offered on EVERY row, clashing or not. A notice that took
                      the control away would be deciding. */}
                  <button
                    type="button"
                    onClick={() => onRemove(subject.id)}
                    aria-label={t('draft.remove', { subject: subject.name })}
                    className={cn(ICON_BUTTON, 'text-secondary-foreground', interactiveGhost)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              )
            })}

            {clashes.map((clash) => (
              <div
                key={`${clash.first.id}-${clash.second.id}-${clash.dayOfWeek}-${clash.startMinutes}`}
                data-testid="planificador-clash"
                className="flex gap-3 rounded-lg border border-destructive bg-(--color-urgent-soft) px-4 py-3"
              >
                <TriangleAlert className="mt-[2px] h-4 w-4 shrink-0 text-destructive" aria-hidden />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-body-lg font-semibold text-foreground">
                    {t('clash.title', { first: clash.first.name, second: clash.second.name })}
                  </span>
                  <span className="text-body-sm text-secondary-foreground">
                    {t('clash.body', {
                      day: weekdaysLong[toMondayFirstIndex(clash.dayOfWeek)],
                      start: formatTime(clash.startMinutes),
                      end: formatTime(clash.endMinutes)
                    })}
                  </span>
                </div>
              </div>
            ))}

            {/* Molded on the Progreso card in the subject detail: same
                surface, radius, border and padding, same overline + figure
                header, same track. */}
            <div
              data-testid="planificador-weekly-load"
              className="mt-1 flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-overline font-semibold text-muted-foreground">{t('weeklyLoad.heading')}</span>
                <span className="text-body-sm font-semibold text-foreground">
                  {t('weeklyLoad.hours', { value: formatHoursValue(load.totalMinutes) })}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  data-testid="planificador-weekly-load-fill"
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${weeklyLoadFraction(load.totalMinutes) * 100}%` }}
                />
              </div>
              <span className="text-body-sm text-muted-foreground">
                {t('weeklyLoad.caption', {
                  subjects: t('weeklyLoad.subjectsCount', { count: load.subjectCount }),
                  classes: t('weeklyLoad.classesCount', { count: load.classCount })
                })}
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
