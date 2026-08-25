// Container (design §4): owns data fetching (TanStack Query, key
// ['horario','week']) and the ephemeral "which class was clicked" state.
// Delegates rendering to the presentational HorarioGrid. This screen has NO
// direct-edit affordance (spec: "Read-Only Schedule Projection") — clicking
// a class block routes to the SAME EditarMateriaModal the materias domain
// already owns, opened directly on its Horario tab.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { EditarMateriaModal } from '../../materias/components/EditarMateriaModal'
import { computeWeeklyMinutes } from '../../materias/domain/subjectDetail'
import { attendsClasses, collectSubjectIds } from '../../materias/domain/subjectStatus'
import { toMondayFirstIndex } from '../../shared/domain/dayOfWeek'
import { horarioApi } from '../adapters/horarioApi'
import { HorarioGrid } from '../components/HorarioGrid'
import { projectWeek } from '../domain/weekProjection'

interface HorarioContainerProps {
  /** Injection point for deterministic "today" column highlighting in tests. Defaults to the real clock. */
  now?: Date
}

export function HorarioContainer({ now = new Date() }: HorarioContainerProps = {}): React.JSX.Element {
  const { t } = useTranslation('horario')
  const queryClient = useQueryClient()
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null)

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

  // Fetched only once a class block is clicked — the grid itself never
  // needs the full subject+deadlines aggregate, only the edit modal does.
  const { data: selectedSubject } = useQuery({
    queryKey: ['materias', 'detail', selectedSubjectId],
    queryFn: () => materiasApi.detail(selectedSubjectId as number),
    enabled: selectedSubjectId !== null
  })

  const updateMutation = useMutation({
    mutationFn: materiasApi.updateSchedule,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['horario'] })
      void queryClient.invalidateQueries({ queryKey: ['materias'] })
      setSelectedSubjectId(null)
    }
  })

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
          onSelectClass={setSelectedSubjectId}
        />
      )}

      {selectedSubject && (
        <EditarMateriaModal
          subject={selectedSubject}
          initialTab="horario"
          onSubmit={(input) => updateMutation.mutate(input)}
          onClose={() => setSelectedSubjectId(null)}
        />
      )}
    </div>
  )
}
