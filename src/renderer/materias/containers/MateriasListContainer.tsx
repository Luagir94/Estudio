// Container (design §4): owns data fetching (TanStack Query, key
// ['materias']), the status filter and the create modal; delegates rendering
// to the presentational MateriasList/SubjectStatusFilter/modals.
//
// This screen is READ-ONLY about outcomes. It shows the `sinCerrar` status
// through the filter chips, but closing a subject happens in the subject
// DETAIL, and only there (`SubjectDetailContainer`). The close flow used to
// live here behind a "N materias quedaron sin cerrar" banner that rendered
// only once a período had ENDED — so a promoción could not be recorded
// during the cursada, and `finalPendiente` (the outcome that reveals the
// finales section) was unreachable with it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { carrerasApi } from '../../carreras/adapters/carrerasApi'
import { pickDefaultPeriodId } from '../../carreras/domain/period'
import { materiasApi } from '../adapters/materiasApi'
import { MateriasEmptyState } from '../components/MateriasEmptyState'
import { MateriasList } from '../components/MateriasList'
import { NuevaMateriaModal } from '../components/NuevaMateriaModal'
import { SubjectStatusFilter } from '../components/SubjectStatusFilter'
import {
  matchesStatusFilter,
  resolveSubjectStatus,
  type SubjectStatus,
  type SubjectStatusFilter as FilterValue
} from '../domain/subjectStatus'
import { Button } from '../../shared/components/ui/button'
import type { SubjectWithStatus } from '../../../shared/ipc/materias'

interface MateriasListContainerProps {
  /** Navigates to the subject detail view. Omit for a static list. */
  onSelectSubject?: (id: number) => void
  /**
   * Navigates to Carreras. Threaded down to `NuevaMateriaModal`'s "no
   * periods yet" dead end, its only consumer. Omit for a static list.
   */
  onGoToCarreras?: () => void
  /** Injected only by tests — status depends on the clock at render time. */
  now?: Date
}

const ALL_FILTERS: FilterValue[] = ['activas', 'standby', 'aprobadas', 'reprobadas', 'sinCerrar', 'todas']

// A subject with no period has no end date to have passed, so it can never
// read as "sin cerrar". An open interval starting at the epoch keeps it
// reading as cursando without inventing dates it does not have.
const NO_PERIOD = { startsOn: '1970-01-01', endsOn: null }

function statusOf(subject: SubjectWithStatus, now: Date): SubjectStatus {
  return resolveSubjectStatus(
    { outcome: subject.outcome, period: subject.period ?? NO_PERIOD, finals: subject.finals },
    now
  )
}

export function MateriasListContainer({
  onSelectSubject,
  onGoToCarreras,
  now
}: MateriasListContainerProps = {}): React.JSX.Element {
  const { t } = useTranslation('materias')
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [filter, setFilter] = useState<FilterValue>('activas')
  const today = now ?? new Date()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['materias'],
    queryFn: materiasApi.list
  })

  // Feeds the período picker. Shares the ['carreras'] key with the Carreras
  // screen, so opening this form costs nothing once that screen was visited.
  const { data: programs } = useQuery({
    queryKey: ['carreras'],
    queryFn: carrerasApi.list
  })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['materias'] })
    // The carreras cards show subject counts and the program average.
    void queryClient.invalidateQueries({ queryKey: ['carreras'] })
  }

  const createMutation = useMutation({
    mutationFn: materiasApi.create,
    onSuccess: () => {
      invalidate()
      setIsCreateOpen(false)
    }
  })

  // Pre-selects the período picker. Flattened across every carrera because
  // the active period is what matters, not which program owns it.
  const defaultPeriodId = useMemo(
    () =>
      pickDefaultPeriodId(
        (programs ?? []).flatMap((program) => program.periods),
        today
      ),
    [programs, today]
  )

  const { counts, visible } = useMemo(() => {
    const subjects = data ?? []
    const withStatus = subjects.map((subject) => ({ subject, status: statusOf(subject, today) }))
    return {
      counts: Object.fromEntries(
        ALL_FILTERS.map((value) => [
          value,
          withStatus.filter((entry) => matchesStatusFilter(entry.status, value)).length
        ])
      ) as Record<FilterValue, number>,
      visible: withStatus.filter((entry) => matchesStatusFilter(entry.status, filter)).map((entry) => entry.subject)
    }
  }, [data, filter, today])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-display-lg font-bold text-foreground">{t('materiasListContainer.title')}</h1>
          <p className="text-body text-secondary-foreground">
            {t('materiasListContainer.subtitle', {
              subjects: data
                ? t('materiasListContainer.subjectsCount', { count: data.length })
                : t('materiasListContainer.loadingCount')
            })}
          </p>
        </div>
        <Button type="button" onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('materiasListContainer.addSubject')}
        </Button>
      </div>

      {/* Zero subjects OVERALL is the onboarding case (approved design) —
          filter chips over nothing would only decorate the dead end. The
          filtered-empty wording inside MateriasList keeps covering "subjects
          exist but this filter matched none". */}
      {data &&
        (data.length === 0 ? (
          <MateriasEmptyState onAddSubject={() => setIsCreateOpen(true)} onGoToCarreras={() => onGoToCarreras?.()} />
        ) : (
          <SubjectStatusFilter value={filter} counts={counts} onChange={setFilter} />
        ))}

      {isLoading && <p className="text-body-lg text-muted-foreground">{t('materiasListContainer.loading')}</p>}
      {isError && <p className="text-body-lg text-destructive">{t('materiasListContainer.loadError')}</p>}
      {data && data.length > 0 && <MateriasList subjects={visible} now={today} onSelect={onSelectSubject} />}

      {isCreateOpen && (
        <NuevaMateriaModal
          programs={programs ?? []}
          defaultPeriodId={defaultPeriodId}
          onSubmit={(input) => createMutation.mutate(input)}
          onClose={() => setIsCreateOpen(false)}
          onGoToCarreras={() => {
            setIsCreateOpen(false)
            onGoToCarreras?.()
          }}
        />
      )}
    </div>
  )
}
