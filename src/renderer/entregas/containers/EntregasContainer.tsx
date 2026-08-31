// Container (design §4, node `K6MVx`): owns data fetching (TanStack Query,
// key ['entregas']) and the ephemeral modal/confirm-dialog state. Delegates
// rendering to the presentational EntregasList/NuevaEntregaModal/
// DeleteDeadlineConfirmDialog.
//
// Amendment 8: creation moved to the subject detail screen (see
// `materias/containers/SubjectDetailContainer.tsx`) — this screen keeps
// EDIT (which reuses the same `NuevaEntregaModal`, fixed to the deadline's
// existing `subjectId`), toggle-done, and delete only. The ['materias']
// query here is READ-ONLY status facts for the open-coursework filter, not
// a create/subject-picker affordance (none exists on this screen).
//
// `entregas:setDone` is a SEPARATE command from `entregas:update` (design §2
// "Deliberate lifecycle asymmetry" applies within the deadline lifecycle
// too — see `shared/ipc/entregas.ts`), so the done checkbox fires its own
// mutation directly from the row, independent of the edit modal.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeadlineWithSubject } from '../../../shared/ipc/entregas'
import { fechasApi } from '../../fechas/adapters/fechasApi'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { collectSubjectIds, hasOpenCoursework } from '../../materias/domain/subjectStatus'
import { entregasApi } from '../adapters/entregasApi'
import { classifyDeadline } from '../domain/deadline'
import { DeleteDeadlineConfirmDialog } from '../components/DeleteDeadlineConfirmDialog'
import { EntregasList } from '../components/EntregasList'
import { NuevaEntregaModal } from '../components/NuevaEntregaModal'

interface EntregasContainerProps {
  /** Injection point for deterministic bucketing/status text in tests. Defaults to the real clock. */
  now?: Date
}

export function EntregasContainer({ now = new Date() }: EntregasContainerProps = {}): React.JSX.Element {
  const { t } = useTranslation('entregas')
  const queryClient = useQueryClient()
  const [editingDeadline, setEditingDeadline] = useState<DeadlineWithSubject | null>(null)
  const [deletingDeadline, setDeletingDeadline] = useState<DeadlineWithSubject | null>(null)

  const { data, isLoading, isError } = useQuery({ queryKey: ['entregas'], queryFn: entregasApi.list })

  // The entregas payload only names its subject — the outcome/period/finals
  // facts live in the ['materias'] list (invalidated by every outcome/final/
  // period write), so the filter below follows a subject being closed
  // without this screen owning any invalidation.
  const { data: subjectFacts } = useQuery({ queryKey: ['materias'], queryFn: materiasApi.list })

  // The SAME ['fechas'] cache entry the carrera card writes through, so a
  // trámite recorded there appears here without this screen owning any
  // invalidation. Which of them are still upcoming, and where each lands, is
  // the fechas domain's call at render time.
  const { data: academicDates } = useQuery({ queryKey: ['fechas'], queryFn: fechasApi.list })

  // A deadline is coursework: once its subject has none left to owe (closed,
  // or waiting on a final), the row and the urgency counters both drop it.
  // Fail-open: only subjects POSITIVELY known to be closed hide anything, so
  // a still-loading or failed facts query leaves the list as it was.
  const deadlines = useMemo(() => {
    const closedSubjectIds = collectSubjectIds(subjectFacts ?? [], (status) => !hasOpenCoursework(status), now)
    return (data ?? []).filter((deadline) => !closedSubjectIds.has(deadline.subjectId))
  }, [data, subjectFacts, now])

  function invalidateEntregas(): void {
    void queryClient.invalidateQueries({ queryKey: ['entregas'] })
  }

  const updateMutation = useMutation({
    mutationFn: entregasApi.update,
    onSuccess: () => {
      invalidateEntregas()
      setEditingDeadline(null)
    }
  })

  const setDoneMutation = useMutation({
    mutationFn: entregasApi.setDone,
    onSuccess: invalidateEntregas
  })

  const deleteMutation = useMutation({
    mutationFn: entregasApi.delete,
    onSuccess: () => {
      invalidateEntregas()
      setDeletingDeadline(null)
    }
  })

  // Counted over the DEADLINES only: an administrative date is not something
  // you hand in, so it must not inflate "pendientes" or "atrasadas" in a
  // summary the student reads as a workload.
  const pendingCount = deadlines.filter((deadline) => !deadline.done).length
  const overdueCount = deadlines.filter(
    (deadline) => classifyDeadline(deadline.dueAt, deadline.done, now) === 'atrasadas'
  ).length
  const completedCount = deadlines.filter((deadline) => deadline.done).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-display-lg font-bold text-foreground">{t('entregasContainer.title')}</h1>
        <p className="text-body text-secondary-foreground">
          {t('entregasContainer.summary', {
            pending: t('entregasContainer.pendingCount', { count: pendingCount }),
            overdue: t('entregasContainer.overdueCount', { count: overdueCount }),
            completed: t('entregasContainer.completedCount', { count: completedCount })
          })}
        </p>
      </div>

      {isLoading && <p className="text-body-lg text-muted-foreground">{t('entregasContainer.loading')}</p>}
      {isError && <p className="text-body-lg text-destructive">{t('entregasContainer.loadError')}</p>}
      {data && (
        <EntregasList
          deadlines={deadlines}
          academicDates={academicDates ?? []}
          now={now}
          onEdit={setEditingDeadline}
          onToggleDone={(deadline, done) => setDoneMutation.mutate({ id: deadline.id, done })}
          onDelete={setDeletingDeadline}
        />
      )}

      {editingDeadline && (
        <NuevaEntregaModal
          mode="edit"
          subjectId={editingDeadline.subjectId}
          defaultValues={{
            title: editingDeadline.title,
            type: editingDeadline.type,
            dueAt: editingDeadline.dueAt
          }}
          pending={updateMutation.isPending}
          onSubmit={(input) => updateMutation.mutate({ id: editingDeadline.id, ...input })}
          onClose={() => setEditingDeadline(null)}
        />
      )}

      {deletingDeadline && (
        <DeleteDeadlineConfirmDialog
          deadlineTitle={deletingDeadline.title}
          onConfirm={() => deleteMutation.mutate(deletingDeadline.id)}
          onCancel={() => setDeletingDeadline(null)}
        />
      )}
    </div>
  )
}
