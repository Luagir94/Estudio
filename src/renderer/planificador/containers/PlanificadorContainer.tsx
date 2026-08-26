// Container (design §4): owns data fetching (TanStack Query) and the one bit
// of ephemeral state this screen has — which período you are planning.
//
// It fetches THREE caches, and two of them are shared rather than its own:
//
//   - `['materias']` is the subject list every other screen already invalidates.
//     Correlativa edges, slots, outcomes and condiciones all ride on it, so
//     recording a nota in Materias or a correlativa in the edit modal moves
//     this screen's habilitada/bloqueada verdicts with no invalidation of its
//     own.
//   - `['carreras']` is the same cache the Carreras screen and the sidebar's
//     brand block read. Correcting a período's dates re-orders this switcher in
//     the same tick.
//   - `['planificador']` is the draft, and the only cache this screen owns.
//
// Every verdict is computed HERE, at render time, from those raw payloads —
// never baked into a cached one. Eligibility depends on "today" only through
// the período list, and the clash/load readings depend on slots the student
// can edit two screens away; a payload carrying the answers would go stale
// between renders (the rule `hoy.ts`/`materias.ts` already state).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { carrerasApi } from '../../carreras/adapters/carrerasApi'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { planificadorApi } from '../adapters/planificadorApi'
import { PlanificadorScreen } from '../components/PlanificadorScreen'
import { type DraftSubject, findScheduleClashes, summarizeWeeklyLoad } from '../domain/draftSchedule'
import { listPlannablePeriods } from '../domain/plannablePeriods'
import { listCandidates } from '../domain/requirements'

interface PlanificadorContainerProps {
  /** Injection point for deterministic período classification in tests. Defaults to the real clock. */
  now?: Date
}

export function PlanificadorContainer({ now = new Date() }: PlanificadorContainerProps = {}): React.JSX.Element {
  const { t } = useTranslation('planificador')
  const queryClient = useQueryClient()
  const [chosenPeriodId, setChosenPeriodId] = useState<number | null>(null)

  const { data: subjects, isLoading, isError } = useQuery({ queryKey: ['materias'], queryFn: materiasApi.list })
  const { data: programs } = useQuery({ queryKey: ['carreras'], queryFn: carrerasApi.list })
  const { data: entries } = useQuery({ queryKey: ['planificador'], queryFn: planificadorApi.list })

  const periods = useMemo(() => listPlannablePeriods(programs ?? [], now), [programs, now])

  // The chosen período, but only while it is still on offer. A período that
  // ended, or was deleted from Carreras, falls back to the first one the
  // switcher lists instead of leaving the screen pointed at nothing — the
  // state here is a PREFERENCE, and the list is the truth.
  const selectedPeriodId = periods.some((period) => period.id === chosenPeriodId)
    ? chosenPeriodId
    : (periods[0]?.id ?? null)

  const draftedSubjectIds = useMemo(
    () =>
      new Set((entries ?? []).filter((entry) => entry.periodId === selectedPeriodId).map((entry) => entry.subjectId)),
    [entries, selectedPeriodId]
  )

  const candidates = useMemo(() => listCandidates(subjects ?? [], draftedSubjectIds), [subjects, draftedSubjectIds])

  // `SubjectWithStatus` satisfies `DraftSubject` structurally (id/name/color/
  // slots), so this narrows rather than adapts — no second shape to keep in
  // step with the Horario projection these readings ride on.
  const draft: DraftSubject[] = useMemo(
    () => (subjects ?? []).filter((subject) => draftedSubjectIds.has(subject.id)),
    [subjects, draftedSubjectIds]
  )

  const clashes = useMemo(() => findScheduleClashes(draft), [draft])
  const load = useMemo(() => summarizeWeeklyLoad(draft), [draft])

  function invalidateDraft(): void {
    void queryClient.invalidateQueries({ queryKey: ['planificador'] })
  }

  const addMutation = useMutation({ mutationFn: planificadorApi.addEntry, onSuccess: invalidateDraft })
  const removeMutation = useMutation({ mutationFn: planificadorApi.removeEntry, onSuccess: invalidateDraft })

  if (isLoading) {
    return <p className="text-body-lg text-muted-foreground">{t('container.loading')}</p>
  }
  if (isError || !subjects) {
    return <p className="text-body-lg text-destructive">{t('container.loadError')}</p>
  }

  return (
    <PlanificadorScreen
      periods={periods}
      selectedPeriodId={selectedPeriodId}
      onSelectPeriod={setChosenPeriodId}
      candidates={candidates}
      draft={draft}
      clashes={clashes}
      load={load}
      // Both guarded on a período being selected: with none there is no draft
      // to write to, and the screen is already showing its empty state instead
      // of any of these controls.
      onAdd={(subjectId) => {
        if (selectedPeriodId !== null) {
          addMutation.mutate({ periodId: selectedPeriodId, subjectId })
        }
      }}
      onRemove={(subjectId) => {
        if (selectedPeriodId !== null) {
          removeMutation.mutate({ periodId: selectedPeriodId, subjectId })
        }
      }}
    />
  )
}
