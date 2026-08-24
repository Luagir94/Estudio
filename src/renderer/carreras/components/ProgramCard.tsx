// Presentational (design §4, node `JzjFV` — verified via the Pencil MCP
// tools): a CARD, not a table row. Programs are few and each one carries a
// small set of period chips, which a table column cannot hold.
//
// No data fetching and no `new Date()`: `now` arrives as a prop because
// period status is a rendering-time question (same precedent as
// groupDeadlines in entregas), and a component that reads the clock itself
// cannot be tested against a fixed day.
import { ChevronRight, Infinity as InfinityIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../shared/lib/cn'
import { interactiveSurface } from '../../shared/lib/interactive'
import { formatPeriodRange, isOpenEnded, periodStatus } from '../domain/period'
import { calculateProgramAverage } from '../domain/program'
import { isPassed } from '../../materias/domain/subjectStatus'
import type { PeriodRecord, ProgramWithPeriods } from '../../../shared/ipc/carreras'

interface ProgramCardProps {
  program: ProgramWithPeriods
  now: Date
  onSelect?: (id: number) => void
}

function SchemeBadge({ program }: { program: ProgramWithPeriods }): React.JSX.Element {
  const { t } = useTranslation('carreras')
  if (program.gradingScheme === 'binario') {
    return (
      <span className="rounded-md border border-border bg-muted px-2 py-1 text-caption font-semibold text-secondary-foreground">
        {t('gradingScheme.binario')}
      </span>
    )
  }

  const average = calculateProgramAverage(
    program.gradedSubjects.map((subject) => ({ grade: subject.grade, passed: isPassed(subject) }))
  )

  return (
    <span
      title={average.withFailed !== null ? t('programCard.averageTooltip') : undefined}
      className="rounded-md border border-primary bg-sidebar-accent px-2 py-1 text-caption font-semibold text-primary-ink"
    >
      {average.withFailed !== null
        ? t('programCard.average', { value: average.withFailed })
        : t('programCard.noGradesYet')}
    </span>
  )
}

// The chip mixes two type steps — the name at 12px, the date at 11px — so it
// aligns on the BASELINE. `items-center` centres each text box on its own, and
// a smaller box centred against a bigger one sits off the shared baseline: the
// date floats above the name and the row stops reading as one line. The dot
// and the infinity glyph have no baseline of their own (they are boxes, not
// text), so they keep centring themselves against the line.
function PeriodChip({ period, now }: { period: PeriodRecord; now: Date }): React.JSX.Element {
  const { t } = useTranslation('carreras')
  const isActive = periodStatus(period, now) === 'activo'
  return (
    <li
      className={
        isActive
          ? 'flex items-baseline gap-2 rounded-lg border border-primary bg-sidebar-accent px-3 py-2'
          : 'flex items-baseline gap-2 rounded-lg border border-border bg-muted px-3 py-2'
      }
    >
      <span
        aria-hidden="true"
        className={
          isActive
            ? 'h-[7px] w-[7px] shrink-0 self-center rounded-full bg-primary'
            : 'h-[7px] w-[7px] shrink-0 self-center rounded-full bg-secondary-foreground'
        }
      />
      <strong className="text-body-sm font-semibold text-foreground">{period.name}</strong>
      <span className="text-caption text-secondary-foreground">
        {formatPeriodRange(period.startsOn, period.endsOn)}
      </span>
      {isOpenEnded(period) && (
        <InfinityIcon
          className="h-3 w-3 shrink-0 self-center text-muted-foreground"
          aria-label={t('period.neverEnds')}
        />
      )}
    </li>
  )
}

export function ProgramCard({ program, now, onSelect }: ProgramCardProps): React.JSX.Element {
  const { t } = useTranslation('carreras')
  // Finished periods collapse into a single counter chip: the card is a
  // summary, and a carrera of several years would otherwise push its own
  // active periods off the row.
  const unfinished = program.periods.filter((period) => periodStatus(period, now) !== 'finalizado')
  const finishedCount = program.periods.length - unfinished.length

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      {/* Only the HEADER opens the carrera — the period chips below are not
          clickable — so the highlight has to stop where the target stops.
          The negative margin cancels the padding, buying the highlight room
          inside the card's own p-4 without moving the header. */}
      <button
        type="button"
        onClick={() => onSelect?.(program.id)}
        className={cn(
          '-m-2 flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left',
          interactiveSurface
        )}
      >
        <span className="flex items-center gap-3">
          <span
            aria-hidden="true"
            style={{ backgroundColor: program.color }}
            className="h-9 w-[3px] shrink-0 rounded-sm"
          />
          <span className="flex flex-col gap-1">
            <strong className="text-body-lg font-semibold text-foreground">{program.name}</strong>
            {program.institution && <span className="text-body-sm text-muted-foreground">{program.institution}</span>}
          </span>
        </span>

        <span className="flex items-center gap-3">
          <SchemeBadge program={program} />
          <span className="text-body-sm text-secondary-foreground">
            {t('counts.subjects', { count: program.subjectCount })} ·{' '}
            {t('counts.periods', { count: program.periods.length })}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </span>
      </button>

      {program.periods.length > 0 && (
        <>
          <span aria-hidden="true" className="h-px w-full bg-border" />
          <ul className="flex flex-wrap items-center gap-2">
            {unfinished.map((period) => (
              <PeriodChip key={period.id} period={period} now={now} />
            ))}
            {finishedCount > 0 && (
              <li className="rounded-lg border border-border bg-muted px-3 py-2 text-body-sm font-semibold text-muted-foreground">
                {t('programCard.finishedPeriods', { count: finishedCount })}
              </li>
            )}
          </ul>
        </>
      )}
    </li>
  )
}
