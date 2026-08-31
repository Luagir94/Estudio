// Container (design §4): owns data fetching (TanStack Query, key
// ['horario','week']) and the ephemeral "which class was clicked" state.
// Delegates rendering to the presentational HorarioGrid. This screen has NO
// direct-edit affordance (spec: "Read-Only Schedule Projection"): the horario
// itself is edited from the materia, through the EditarMateriaModal the
// materias domain already owns.
//
// A block has ONE target — its body opens the class dialog — and that is why
// this screen mounts it at all: it is the only surface that can name a class
// on a day other than today. Writing the apunte is NOT one of this screen's
// jobs; that lives in Hoy's ClassRow and in the subject's APUNTES tab, so the
// markdown editor is never mounted here.
import { useQuery } from '@tanstack/react-query'
import { startOfWeek } from 'date-fns'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClaseModalContainer } from '../../clases/containers/ClaseModalContainer'
import { findAttendanceStatus, toLocalIsoDate } from '../../clases/domain/classOccurrence'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { computeWeeklyMinutes } from '../../materias/domain/subjectDetail'
import { attendsClasses, collectSubjectIds } from '../../materias/domain/subjectStatus'
import { toMondayFirstIndex } from '../../shared/domain/dayOfWeek'
import { horarioApi } from '../adapters/horarioApi'
import { HorarioGrid } from '../components/HorarioGrid'
import { getWeekOccurrenceDate, projectWeek, type WeekProjectionSlot } from '../domain/weekProjection'

interface HorarioContainerProps {
  /** Injection point for deterministic "today" column highlighting in tests. Defaults to the real clock. */
  now?: Date
}

export function HorarioContainer({ now = new Date() }: HorarioContainerProps = {}): React.JSX.Element {
  const { t } = useTranslation('horario')
  // The DATE is part of the open state, not just the subject: the same block
  // means a different class every week, and the dialog is about one class.
  const [openClase, setOpenClase] = useState<{ subjectId: number; date: string } | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['horario', 'week'],
    queryFn: horarioApi.week
  })

  // The week payload carries no outcome/period/finals facts — those live in
  // the ['materias'] list (shared with the Materias screen, and invalidated
  // by every outcome/final/period write), so the filter below follows a
  // subject being closed without this screen owning any invalidation.
  const { data: subjectFacts } = useQuery({
    queryKey: ['materias'],
    queryFn: materiasApi.list
  })

  // A subject that no longer attends classes (closed, waiting on a final, or
  // period over) has no slot to occupy the week. Fail-open: only a subject
  // POSITIVELY known to be out is hidden, so a still-loading or failed facts
  // query leaves the grid as it was rather than blanking it.
  const hiddenSubjectIds = useMemo(
    () => collectSubjectIds(subjectFacts ?? [], (status) => !attendsClasses(status), now),
    [subjectFacts, now]
  )
  const attendingSubjects = useMemo(
    () => (data ?? []).filter((subject) => !hiddenSubjectIds.has(subject.id)),
    [data, hiddenSubjectIds]
  )

  // Fetched only once a class block is clicked — the grid itself never needs
  // the full subject+deadlines aggregate, only the two dialogs do. ONE query
  // serves both: they are mutually exclusive (each opener closes the other),
  // and they want the same aggregate — the edit modal reads `slots`, the class
  // dialog reads `attendance` and `classNotes` off the very same record. Two
  // queries on the same key would only be two names for one cache entry.
  const detailSubjectId = openClase?.subjectId ?? null
  const { data: detailSubject } = useQuery({
    queryKey: ['materias', 'detail', detailSubjectId],
    queryFn: () => materiasApi.detail(detailSubjectId as number),
    enabled: detailSubjectId !== null
  })

  // Gated on the open state, never on the query alone: a stale record from
  // the previously opened subject must not flash into the dialog that just
  // opened.
  const claseSubject = openClase === null ? undefined : detailSubject

  // The grid hands back a WEEKDAY; the calendar day that weekday falls on is
  // this container's to decide, because the grid has no notion of which week
  // it is showing. Composed with `getWeekOccurrenceDate` (calendar-day math,
  // never fixed 24h multiples) so the date survives a DST boundary — design
  // §3a "the DST rule", the same rule Hoy's week strip follows.
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const classDateOf = (slot: WeekProjectionSlot): string =>
    toLocalIsoDate(getWeekOccurrenceDate(weekStart, slot.dayOfWeek, slot.startMinutes))

  const handleOpenClase = (slot: WeekProjectionSlot): void => {
    setOpenClase({ subjectId: slot.subjectId, date: classDateOf(slot) })
  }

  const columns = projectWeek(attendingSubjects)
  const weeklyMinutes = computeWeeklyMinutes(attendingSubjects.flatMap((subject) => subject.slots))

  // The grid only renders Lunes..Viernes (mondayFirstIndex 0..4, matching
  // the .pen design) — a weekend "today" has nothing to highlight.
  const rawTodayIndex = toMondayFirstIndex(now.getDay())
  const todayMondayFirstIndex = rawTodayIndex < 5 ? rawTodayIndex : null

  return (
    // h-full so the grid below can claim the leftover height and reach the
    // bottom of the window instead of stopping at a fixed row height.
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-display-lg font-bold text-foreground">{t('container.title')}</h1>
        <p className="text-body text-secondary-foreground">
          {t('container.subtitle', { hours: Math.round(weeklyMinutes / 60) })}
        </p>
      </div>

      {isLoading && <p className="text-body-lg text-muted-foreground">{t('container.loading')}</p>}
      {isError && <p className="text-body-lg text-destructive">{t('container.loadError')}</p>}
      {data && (
        <HorarioGrid
          columns={columns}
          todayMondayFirstIndex={todayMondayFirstIndex}
          now={now}
          onOpenClase={handleOpenClase}
        />
      )}

      {/* The SAME dialog Hoy's ClassRow and the subject detail's APUNTES rows
          open — mounted here with the date this block stands for in the week
          on screen, and with the subject's own weekly pattern, out of which it
          composes the occurrence. */}
      {claseSubject && openClase && (
        <ClaseModalContainer
          subjectId={openClase.subjectId}
          subjectName={claseSubject.name}
          date={openClase.date}
          slots={claseSubject.slots}
          attendanceStatus={findAttendanceStatus(claseSubject.attendance, openClase.subjectId, openClase.date)}
          onClose={() => setOpenClase(null)}
        />
      )}
    </div>
  )
}
