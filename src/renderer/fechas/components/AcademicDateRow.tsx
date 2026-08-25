// Presentational: the administrative-date row that sits INSIDE the Entregas
// urgency groups (approved design). A visual variant of
// `entregas/components/DeadlineRow.tsx`, and the differences are all the ones
// the model dictates:
//
//   - the done-toggle is replaced by a calendar-clock mark, NOT a disabled
//     checkbox: a trámite has no completion to toggle, and a checkbox that
//     cannot be checked is a promise the row cannot keep;
//   - the subject colour dot is gone, because the tag names a CARRERA, and
//     the dot in that position means "materia" everywhere else in the app;
//   - the row is not clickable. Editing a date belongs to the carrera that
//     owns it (the FECHAS ADMINISTRATIVAS card), the same way Hoy shows
//     deadlines it does not let you edit.
//
// The date chip prints the day the trámite HAPPENS (`startsOn`) while the
// pill counts down to when it CLOSES (`endsOn ?? startsOn`) — for a window
// those are two different, and both useful, facts.
import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AcademicDateWithProgram } from '../../../shared/ipc/fechas'
import { cn } from '../../shared/lib/cn'
import type { DeadlineUrgency } from '../../entregas/domain/deadline'
import { classifyAcademicDateUrgency, formatAcademicDateStatus } from '../domain/academicDate'

interface AcademicDateRowProps {
  date: AcademicDateWithProgram
  /** Reference instant for the status pill. Defaults to the real clock. */
  now?: Date
}

// Violet is reserved for interaction, so the pill grades urgent → warn →
// neutral. The SAME mapping as the entregas/Hoy deadline rows — a trámite and
// an entrega closing on the same day must not read differently.
const urgencyPillClassNames: Record<DeadlineUrgency, string> = {
  overdue: 'bg-(--color-urgent-soft) text-(--color-urgent)',
  imminent: 'bg-(--color-warn-soft) text-(--color-warn)',
  thisWeek: 'bg-(--color-surface-sunken) text-(--color-ink-secondary)',
  later: 'bg-(--color-surface-sunken) text-(--color-ink-muted)'
}

export function AcademicDateRow({ date, now = new Date() }: AcademicDateRowProps): React.JSX.Element {
  const { t } = useTranslation('fechas')
  // The same consolidated month table every other date chip in the app reads.
  const monthLabels = t('common:monthsCaps', { returnObjects: true }) as string[]
  const startDate = new Date(`${date.startsOn}T00:00`)

  return (
    <div
      data-testid="academic-date-row"
      className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
    >
      <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />

      <span className="flex w-11 shrink-0 flex-col items-center gap-1 rounded-lg bg-muted py-2">
        <span className="font-display text-body-lg font-semibold text-foreground">
          {startDate.getDate().toString().padStart(2, '0')}
        </span>
        <span className="text-overline font-semibold text-muted-foreground">{monthLabels[startDate.getMonth()]}</span>
      </span>

      <span className="flex flex-1 flex-col gap-1">
        <span className="text-body-lg font-semibold text-foreground">{date.title}</span>
        <span className="text-body-sm text-secondary-foreground">
          {t('academicDateRow.tag', { program: date.programName })}
        </span>
      </span>

      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-1 text-caption font-semibold',
          urgencyPillClassNames[classifyAcademicDateUrgency(date, now)]
        )}
      >
        {formatAcademicDateStatus(date, now)}
      </span>
    </div>
  )
}
