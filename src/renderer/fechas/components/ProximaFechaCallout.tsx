// Presentational (approved design: the warn callout above Hoy's deadlines
// column). ONE date, never a list — Hoy is a read-model whose job is to be
// glanceable, and a second callout would be a second thing to learn to
// ignore. Which date this is, and whether there is one at all, is decided by
// `pickImminentAcademicDate` in the domain; this component only draws it.
//
// Warn, not urgent and never the brand accent: an inscription window closing
// in three days is a heads-up, not an emergency, and the accent is reserved for
// interaction (this callout is not clickable).
import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AcademicDateWithProgram } from '../../../shared/ipc/fechas'
import { formatAcademicDateLongRange, formatAcademicDateStatusInline } from '../domain/academicDate'

interface ProximaFechaCalloutProps {
  date: AcademicDateWithProgram
  /** Reference instant for the "cierra en…" copy. Defaults to the real clock. */
  now?: Date
}

export function ProximaFechaCallout({ date, now = new Date() }: ProximaFechaCalloutProps): React.JSX.Element {
  const { t } = useTranslation('fechas')

  return (
    <div className="flex items-start gap-3 rounded-lg border border-(--color-warn) bg-(--color-warn-soft) px-4 py-3">
      <CalendarClock className="mt-px h-4 w-4 shrink-0 text-(--color-warn)" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <strong className="text-body-sm font-semibold text-foreground">
          {t('callout.title', { title: date.title, status: formatAcademicDateStatusInline(date, now) })}
        </strong>
        <span className="text-body-sm text-secondary-foreground">
          {t('callout.subtitle', {
            range: formatAcademicDateLongRange(date.startsOn, date.endsOn),
            program: date.programName
          })}
        </span>
      </div>
    </div>
  )
}
