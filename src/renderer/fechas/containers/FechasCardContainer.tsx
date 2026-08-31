// Container (design §4): owns data fetching (TanStack Query, key ['fechas'])
// and the ephemeral modal/confirm-dialog state for one carrera's
// administrative dates. Delegates rendering to FechasCard / NuevaFechaModal /
// DeleteFechaConfirmDialog.
//
// Composed INTO `CarreraDetailContainer`'s right rail rather than folded into
// it — the same way `SubjectDetailContainer` composes `AdjuntosContainer` and
// `FinalesContainer` instead of growing a fourth query and three more pieces
// of modal state.
//
// It reads the WHOLE list (`fechas:list` is unfiltered — see
// shared/ipc/fechas.ts) and filters to this program here, so this card, Hoy's
// callout and the Entregas rows all share one cache entry: a date created
// here shows up on the other two screens without any cross-screen
// invalidation to keep in sync.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AcademicDateRecord } from '../../../shared/ipc/fechas'
import { describeIpcError } from '../../shared/lib/ipcErrorCopy'
import { fechasApi } from '../adapters/fechasApi'
import { DeleteFechaConfirmDialog } from '../components/DeleteFechaConfirmDialog'
import { FechasCard } from '../components/FechasCard'
import { NuevaFechaModal } from '../components/NuevaFechaModal'

interface FechasCardContainerProps {
  programId: number
  programName: string
  /** Injection point for deterministic past/upcoming styling in tests. Defaults to the real clock. */
  now?: Date
}

export function FechasCardContainer({ programId, programName, now }: FechasCardContainerProps): React.JSX.Element {
  const { t } = useTranslation('fechas')
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingDate, setEditingDate] = useState<AcademicDateRecord | null>(null)
  const [deletingDate, setDeletingDate] = useState<AcademicDateRecord | null>(null)
  const today = now ?? new Date()

  const { data, isLoading, isError } = useQuery({ queryKey: ['fechas'], queryFn: fechasApi.list })

  function invalidateFechas(): void {
    void queryClient.invalidateQueries({ queryKey: ['fechas'] })
  }

  const createMutation = useMutation({
    mutationFn: fechasApi.create,
    onSuccess: () => {
      invalidateFechas()
      setIsCreateOpen(false)
    }
  })

  const updateMutation = useMutation({
    mutationFn: fechasApi.update,
    onSuccess: () => {
      invalidateFechas()
      setEditingDate(null)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: fechasApi.delete,
    onSuccess: () => {
      invalidateFechas()
      setDeletingDate(null)
    }
  })

  const ownDates = useMemo(
    () => (data ?? []).filter((academicDate) => academicDate.programId === programId),
    [data, programId]
  )

  return (
    <>
      {isLoading && (
        <p className="rounded-xl border border-border bg-card p-4 text-body-sm text-muted-foreground">
          {t('fechasCard.loading')}
        </p>
      )}
      {isError && (
        <p className="rounded-xl border border-border bg-card p-4 text-body-sm text-destructive">
          {t('fechasCard.loadError')}
        </p>
      )}
      {data && (
        <FechasCard dates={ownDates} now={today} onAdd={() => setIsCreateOpen(true)} onSelect={setEditingDate} />
      )}

      {isCreateOpen && (
        <NuevaFechaModal
          programId={programId}
          programName={programName}
          error={describeIpcError(createMutation.error)}
          pending={createMutation.isPending}
          onSubmit={(input) => createMutation.mutate(input)}
          onClose={() => setIsCreateOpen(false)}
        />
      )}

      {editingDate && (
        <NuevaFechaModal
          programId={programId}
          programName={programName}
          academicDate={editingDate}
          error={describeIpcError(updateMutation.error)}
          // `programId` comes back in the payload because the form validates
          // against the CREATE schema; the update command does not take it (a
          // date never changes carrera), so it is dropped here rather than
          // smuggled across the bridge.
          pending={updateMutation.isPending}
          onSubmit={({ programId: _programId, ...fields }) => updateMutation.mutate({ id: editingDate.id, ...fields })}
          // The confirmation REPLACES the form rather than stacking on it, so
          // the destructive question is never asked underneath an editable
          // copy of the same date (same as EditarCarreraModal).
          onDelete={() => {
            setDeletingDate(editingDate)
            setEditingDate(null)
          }}
          onClose={() => setEditingDate(null)}
        />
      )}

      {deletingDate && (
        <DeleteFechaConfirmDialog
          dateTitle={deletingDate.title}
          error={describeIpcError(deleteMutation.error)}
          onConfirm={() => deleteMutation.mutate(deletingDate.id)}
          onCancel={() => setDeletingDate(null)}
        />
      )}
    </>
  )
}
