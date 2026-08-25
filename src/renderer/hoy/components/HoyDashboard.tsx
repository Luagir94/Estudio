// Presentational (design §4, node `E2pJ95` — Grupo Hoy: Header [date
// headline + day summary] + Body [Classes Column, Deadlines Column] + Week
// Section [ESTA SEMANA strip]). No data fetching, no IPC — that lives in
// HoyContainer.
//
// Hoy used to be a "read-model... sin acciones primarias" (design node
// `VQJO4`) and this component had zero click handlers. The approved
// class-marks design ends that deliberately, and narrowly: the only write
// affordances here are a ClassRow's three controls, they act on the class the
// row already names, and the mutations still live in the container.
import type { TFunction } from 'i18next'
import { Coffee } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AcademicDateWithProgram } from '../../../shared/ipc/fechas'
import type { AttendanceStatus } from '../../../shared/ipc/materias'
import { ProximaFechaCallout } from '../../fechas/components/ProximaFechaCallout'
import { toMondayFirstIndex } from '../../shared/domain/dayOfWeek'
import { ClassRow } from './ClassRow'
import { DeadlineRow } from './DeadlineRow'
import { WeekStrip } from './WeekStrip'
import { getNextClassHighlight } from '../domain/dashboard'
import type {
  DashboardDeadline,
  FreeBlock,
  NextClassOccurrence,
  TodayClassWithMarks,
  WeekStripDay
} from '../domain/dashboard'

/** "y" before most words, "e" before a word starting with an i/hi sound (Spanish grammar) — matches the design's own example: "...Bases de Datos e Ingeniería de Software". */
function conjunction(t: TFunction, nextWord: string): string {
  return /^(i|hi)/i.test(nextWord) ? t('dashboard.conjunctionBeforeISound') : t('dashboard.conjunctionDefault')
}

function formatFreeBlock(t: TFunction, block: FreeBlock): string {
  const hours = Math.floor(block.gapMinutes / 60)
  const minutes = block.gapMinutes % 60
  const duration =
    minutes === 0 ? t('dashboard.durationHours', { hours }) : t('dashboard.durationHoursMinutes', { hours, minutes })
  return t('dashboard.freeBlock', {
    duration,
    after: block.afterSubjectName,
    conjunction: conjunction(t, block.beforeSubjectName),
    before: block.beforeSubjectName
  })
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const mins = (minutes % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

interface HoyDashboardProps {
  dateHeadline: string
  daySummary: string
  todayClasses: TodayClassWithMarks[]
  freeBlocks: FreeBlock[]
  deadlines: DashboardDeadline[]
  weekStrip: WeekStripDay[]
  todayMondayFirstIndex: number | null
  /** Feeds the empty state's subtitle. `null` when no next class is derivable (no slots at all). */
  nextClass: NextClassOccurrence | null
  /**
   * The one administrative date close enough to warn about, already chosen by
   * `fechas/domain/academicDate.ts`'s `pickImminentAcademicDate`. `null` — the
   * ordinary case — renders nothing at all: a callout that is always there is
   * a callout nobody reads.
   */
  imminentAcademicDate?: AcademicDateWithProgram | null
  /** Reference instant for deadline status pills. Defaults to the real clock. */
  now?: Date
  /**
   * Records (or clears, with `null`) the mark for one of today's classes.
   * Takes the SUBJECT, not the slot: a mark is anchored to `(subjectId,
   * date)`, and the date is today — which the container already knows.
   */
  onMarkAttendance: (subjectId: number, status: AttendanceStatus | null) => void
  /** Opens the class dialog (asistencia + apunte) for one of today's classes. */
  onOpenClase: (subjectId: number) => void
}

export function HoyDashboard({
  dateHeadline,
  daySummary,
  todayClasses,
  freeBlocks,
  deadlines,
  weekStrip,
  todayMondayFirstIndex,
  nextClass,
  imminentAcademicDate = null,
  now = new Date(),
  onMarkAttendance,
  onOpenClase
}: HoyDashboardProps): React.JSX.Element {
  const { t } = useTranslation('hoy')
  // In-progress-first rule (see getNextClassHighlight): at most ONE row
  // carries the violet accent + "starts in" pill; after the last class the
  // list goes back to plain surface rows.
  const nextClassHighlight = getNextClassHighlight(todayClasses, now)
  // Monday-first, same consolidated table every other weekday label reads.
  const weekdaysLong = t('common:weekdaysLong', { returnObjects: true }) as string[]
  // "el lunes", not "el Lunes" — mid-sentence, Spanish lowercases weekdays.
  const emptyTodaySubtitle = nextClass
    ? t('dashboard.emptyToday.nextClass', {
        day: (weekdaysLong[toMondayFirstIndex(nextClass.dayOfWeek)] ?? '').toLowerCase(),
        time: formatTime(nextClass.startMinutes),
        subject: nextClass.subjectName
      })
    : t('dashboard.emptyToday.noNextClass')
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-display-lg font-bold text-foreground">{dateHeadline}</h1>
        <p className="text-body text-secondary-foreground">{daySummary}</p>
      </div>

      {/* Two columns are the design's DESKTOP shape, not an invariant: below
          `lg` the window no longer has room for two readable columns, so
          "PRÓXIMOS 7 DÍAS" moves under "CLASES DE HOY" instead of both being
          squeezed into unreadable strips (design: grupo "Responsive"). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
        <div className="flex flex-col gap-3">
          <h2 className="text-label font-semibold text-muted-foreground">{t('dashboard.todayClasses')}</h2>
          {todayClasses.length === 0 ? (
            // Designed empty state (approved design): the day off is a state
            // worth drawing, not a one-line apology — a coffee break, plus
            // where the week picks up again when that is derivable.
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-soft">
                <Coffee className="h-5 w-5 text-primary-ink" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="font-display text-title font-semibold text-foreground">
                  {t('dashboard.emptyToday.title')}
                </p>
                <p className="text-body text-secondary-foreground">{emptyTodaySubtitle}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {todayClasses.map((classItem) => (
                <ClassRow
                  key={classItem.slotId}
                  subjectName={classItem.subjectName}
                  subjectColor={classItem.subjectColor}
                  startMinutes={classItem.startMinutes}
                  endMinutes={classItem.endMinutes}
                  location={classItem.location}
                  minutesUntilStart={
                    nextClassHighlight !== null && nextClassHighlight.slotId === classItem.slotId
                      ? nextClassHighlight.minutesUntilStart
                      : null
                  }
                  attendanceStatus={classItem.attendanceStatus}
                  hasNote={classItem.hasNote}
                  onMarkAttendance={(status) => onMarkAttendance(classItem.subjectId, status)}
                  onOpenClase={() => onOpenClase(classItem.subjectId)}
                />
              ))}
              {freeBlocks.map((block, index) => (
                <p key={index} className="rounded-lg bg-muted px-4 py-3 text-body-sm text-muted-foreground">
                  {formatFreeBlock(t, block)}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-label font-semibold text-muted-foreground">{t('dashboard.next7Days')}</h2>
          {/* Above the list, not inside it: a trámite is not an entrega, and
              sorting it among them would say it is. It sits in this column
              because both answer the same question — what is coming. */}
          {imminentAcademicDate && <ProximaFechaCallout date={imminentAcademicDate} now={now} />}
          {deadlines.length === 0 ? (
            <p className="text-body-lg text-muted-foreground">{t('dashboard.noUpcomingDeadlines')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {deadlines.map((deadline) => (
                <DeadlineRow key={deadline.id} deadline={deadline} now={now} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-label font-semibold text-muted-foreground">{t('dashboard.thisWeek')}</h2>
        <WeekStrip days={weekStrip} todayMondayFirstIndex={todayMondayFirstIndex} />
      </div>
    </div>
  )
}
