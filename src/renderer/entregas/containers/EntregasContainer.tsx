// Container (design §4, node `K6MVx`): owns data fetching (TanStack Query,
// key ['entregas']) and the ephemeral modal/confirm-dialog state. Delegates
// rendering to the presentational EntregasList/NuevaEntregaModal/
// DeleteDeadlineConfirmDialog.
//
// Amendment 8: creation moved to the subject detail screen (see
// `materias/containers/SubjectDetailContainer.tsx`) — this screen keeps
// EDIT (which reuses the same `NuevaEntregaModal`, fixed to the deadline's
// existing `subjectId`), toggle-done, and delete only. There is no
// `materias:list` query here anymore since no create/subject-picker
// affordance exists on this screen.
//
// `entregas:setDone` is a SEPARATE command from `entregas:update` (design §2
// "Deliberate lifecycle asymmetry" applies within the deadline lifecycle
// too — see `shared/ipc/entregas.ts`), so the done checkbox fires its own
// mutation directly from the row, independent of the edit modal.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { DeadlineWithSubject } from '../../../shared/ipc/entregas'
import { entregasApi } from '../adapters/entregasApi'
import { classifyDeadline } from '../domain/deadline'
import { DeleteDeadlineConfirmDialog } from '../components/DeleteDeadlineConfirmDialog'
import { EntregasList } from '../components/EntregasList'
import { NuevaEntregaModal } from '../components/NuevaEntregaModal'

interface EntregasContainerProps {
  /** Injection point for deterministic bucketing/status text in tests. Defaults to the real clock. */
  now?: Date
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

export function EntregasContainer({ now = new Date() }: EntregasContainerProps = {}): React.JSX.Element {
  const queryClient = useQueryClient()
  const [editingDeadline, setEditingDeadline] = useState<DeadlineWithSubject | null>(null)
  const [deletingDeadline, setDeletingDeadline] = useState<DeadlineWithSubject | null>(null)

  const { data, isLoading, isError } = useQuery({ queryKey: ['entregas'], queryFn: entregasApi.list })

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

  const deadlines = data ?? []
  const pendingCount = deadlines.filter((deadline) => !deadline.done).length
  const overdueCount = deadlines.filter(
    (deadline) => classifyDeadline(deadline.dueAt, deadline.done, now) === 'atrasadas'
  ).length
  const completedCount = deadlines.filter((deadline) => deadline.done).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-display-lg font-bold text-foreground">Entregas</h1>
        <p className="text-body text-secondary-foreground">
          {pendingCount} {pluralize(pendingCount, 'pendiente', 'pendientes')} · {overdueCount}{' '}
          {pluralize(overdueCount, 'atrasada', 'atrasadas')} · {completedCount}{' '}
          {pluralize(completedCount, 'completada', 'completadas')} este cuatrimestre
        </p>
      </div>

      {isLoading && <p className="text-body-lg text-muted-foreground">Cargando entregas…</p>}
      {isError && <p className="text-body-lg text-destructive">No se pudieron cargar las entregas.</p>}
      {data && (
        <EntregasList
          deadlines={data}
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
