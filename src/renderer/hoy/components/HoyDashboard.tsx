// Presentational (design §4, node `E2pJ95` — Grupo Hoy: Header [date
// headline + day summary] + Body [Classes Column, Deadlines Column] + Week
// Section [ESTA SEMANA strip]). No data fetching, no IPC — that lives in
// HoyContainer. Read-only: Hoy is a "read-model... sin acciones primarias"
// (design node `VQJO4`), so this component has zero click handlers.
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ClassRow } from './ClassRow'
import { DeadlineRow } from './DeadlineRow'
import { WeekStrip } from './WeekStrip'
import type { DashboardDeadline, FreeBlock, TodayClass, WeekStripDay } from '../domain/dashboard'

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

interface HoyDashboardProps {
  dateHeadline: string
  daySummary: string
  todayClasses: TodayClass[]
  freeBlocks: FreeBlock[]
  deadlines: DashboardDeadline[]
  weekStrip: WeekStripDay[]
  todayMondayFirstIndex: number | null
  /** Reference instant for deadline status pills. Defaults to the real clock. */
  now?: Date
}

export function HoyDashboard({
  dateHeadline,
  daySummary,
  todayClasses,
  freeBlocks,
  deadlines,
  weekStrip,
  todayMondayFirstIndex,
  now = new Date()
}: HoyDashboardProps): React.JSX.Element {
  const { t } = useTranslation('hoy')
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
            <p className="text-body-lg text-muted-foreground">{t('dashboard.noClassesToday')}</p>
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
