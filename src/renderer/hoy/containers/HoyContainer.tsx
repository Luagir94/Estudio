// Container (design §4, node `E2pJ95` — Grupo Hoy): owns data fetching
// (TanStack Query, key ['hoy','dashboard']) and composes the pure read-model
// via `hoy/domain/dashboard.ts`. Delegates rendering to the presentational
// HoyDashboard. This screen has NO write affordance (spec: "Hoy MUST be a
// pure read-model") — reuses `shared/domain/dayOfWeek.ts`'s
// `toMondayFirstIndex` and `entregas/domain/deadline.ts`'s
// `classifyDeadline`, never re-derives either.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AttendanceStatus } from '../../../shared/ipc/materias'
import { clasesApi } from '../../clases/adapters/clasesApi'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { AttachmentViewerContainer } from '../../adjuntos/containers/AttachmentViewerContainer'
import { useApunteOpener } from '../../clases/containers/useApunteOpener'
import { toLocalIsoDate } from '../../clases/domain/classOccurrence'
import { classifyDeadline } from '../../entregas/domain/deadline'
import { fechasApi } from '../../fechas/adapters/fechasApi'
import { pickImminentAcademicDate } from '../../fechas/domain/academicDate'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { attendsClasses, collectSubjectIds, hasOpenCoursework } from '../../materias/domain/subjectStatus'
import { toMondayFirstIndex } from '../../shared/domain/dayOfWeek'
import { hoyApi } from '../adapters/hoyApi'
import { HoyDashboard } from '../components/HoyDashboard'
import {
  getDashboardDeadlines,
  getFreeBlocks,
  getNextClassOccurrence,
  getTodayClasses,
  getWeekStrip,
  withClassMarks
} from '../domain/dashboard'

interface HoyContainerProps {
  /** Injection point for deterministic "today" composition in tests. Defaults to the real clock. */
  now?: Date
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1)
}

export function HoyContainer({ now = new Date() }: HoyContainerProps = {}): React.JSX.Element {
  const { t } = useTranslation('hoy')
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({ queryKey: ['hoy', 'dashboard'], queryFn: hoyApi.dashboard })
  // The apunte currently being edited, or null. Hoy SWAPS ITSELF for the
  // editor the same way the subject detail does — an apunte is a full
  // document, and a document does not belong in a dialog over a dashboard.
  const [viewedApunte, setViewedApunte] = useState<Attachment | null>(null)

  // The dashboard payload carries no outcome/period/finals facts — those
  // live in the ['materias'] list (invalidated by every outcome/final/period
  // write), so the filters below follow a subject being closed without this
  // screen owning any invalidation.
  const { data: subjectFacts } = useQuery({ queryKey: ['materias'], queryFn: materiasApi.list })

  // Resolves (or creates) the apunte behind a clicked class — the same
  // mechanism the Horario blocks and the APUNTES list use, so "does this
  // class have one yet?" is answered in one place instead of three.
  const { openApunte } = useApunteOpener(setViewedApunte)

  // Administrative dates ride the SAME ['fechas'] cache entry the carrera
  // card writes through, so a trámite recorded there warns here without this
  // screen owning any invalidation. Which one (if any) is worth a warning is
  // the domain's call, not this container's.
  const { data: academicDates } = useQuery({ queryKey: ['fechas'], queryFn: fechasApi.list })

  // Class content belongs to subjects still attending classes; deadline
  // content to subjects that may still owe work (cursando + sinCerrar).
  // Fail-open: only what is POSITIVELY known to be out is hidden, so a
  // still-loading or failed facts query leaves the dashboard as it was.
  const { hiddenFromSchedule, hiddenFromDeadlines } = useMemo(
    () => ({
      hiddenFromSchedule: collectSubjectIds(subjectFacts ?? [], (status) => !attendsClasses(status), now),
      hiddenFromDeadlines: collectSubjectIds(subjectFacts ?? [], (status) => !hasOpenCoursework(status), now)
    }),
    [subjectFacts, now]
  )

  const subjects = (data?.subjects ?? []).filter((subject) => !hiddenFromSchedule.has(subject.id))
  const allDeadlines = (data?.deadlines ?? []).filter((deadline) => !hiddenFromDeadlines.has(deadline.subjectId))

  // Today's LOCAL calendar day, derived here and passed down: main serves the
  // marks unfiltered precisely so this decision stays at render time, where it
  // cannot go stale in the query cache overnight.
  const today = toLocalIsoDate(now)
  const attendance = data?.attendance ?? []
  const classNotes = data?.classNotes ?? []

  const todayClasses = withClassMarks(getTodayClasses(subjects, now), attendance, classNotes, today)
  const freeBlocks = getFreeBlocks(todayClasses)
  const nextClass = getNextClassOccurrence(subjects, now)
  const dashboardDeadlines = getDashboardDeadlines(allDeadlines, now)
  const weekStrip = getWeekStrip(subjects, allDeadlines, now)
  const todayMondayFirstIndex = toMondayFirstIndex(now.getDay())

  const overdueCount = allDeadlines.filter(
    (deadline) => classifyDeadline(deadline.dueAt, deadline.done, now) === 'atrasadas'
  ).length
  const upcoming7Count = dashboardDeadlines.length - overdueCount

  // The inline toggles write ONE thing — the mark — and nothing else: the
  // apunte is edited in the dialog, and no arrangement of marks touches the
  // subject's condición or its outcome. Invalidates both this dashboard and
  // the subject detail, whose ASISTENCIA card reads the same rows.
  const markMutation = useMutation({
    mutationFn: ({ subjectId, status }: { subjectId: number; status: AttendanceStatus | null }) =>
      status === null
        ? clasesApi.clearAttendance({ subjectId, date: today })
        : clasesApi.setAttendance({ subjectId, date: today, status }),
    onSuccess: (_result, { subjectId }) => {
      void queryClient.invalidateQueries({ queryKey: ['hoy', 'dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['materias', 'detail', subjectId] })
    }
  })

  const dateHeadline = capitalize(format(now, t('container.dateHeadlineFormat'), { locale: es }))
  const daySummary = t('container.daySummary', {
    classes: t('container.classesToday', { count: todayClasses.length }),
    overdue: t('container.overdueCount', { count: overdueCount }),
    upcoming: t('container.upcomingCount', { count: upcoming7Count })
  })

  // Hoy SWAPS ITSELF for the editor rather than layering it over the
  // dashboard — the same shape the subject detail uses. An apunte is a whole
  // document; reading one over a list of the day's classes would put two
  // unrelated things on screen and let neither have the room it needs.
  if (viewedApunte !== null) {
    return (
      <AttachmentViewerContainer
        attachment={viewedApunte}
        subjectId={viewedApunte.subjectId}
        subjectName={subjects.find((subject) => subject.id === viewedApunte.subjectId)?.name ?? ''}
        onBack={() => setViewedApunte(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {isLoading && <p className="text-body-lg text-muted-foreground">{t('container.loading')}</p>}
      {isError && <p className="text-body-lg text-destructive">{t('container.loadError')}</p>}
      {data && (
        <HoyDashboard
          dateHeadline={dateHeadline}
          daySummary={daySummary}
          todayClasses={todayClasses}
          freeBlocks={freeBlocks}
          deadlines={dashboardDeadlines}
          weekStrip={weekStrip}
          todayMondayFirstIndex={todayMondayFirstIndex}
          nextClass={nextClass}
          imminentAcademicDate={pickImminentAcademicDate(academicDates ?? [], now)}
          now={now}
          onMarkAttendance={(subjectId, status) => markMutation.mutate({ subjectId, status })}
          onOpenApunte={(subjectId) => openApunte({ subjectId, date: today })}
        />
      )}
    </div>
  )
}
