// Container (design §4): owns the final-exam mutations for one subject.
// Rendered inside the subject detail, which already fetched the finals — so
// this takes them as a prop and only owns writes plus the add form.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { finalesApi } from '../adapters/finalesApi'
import { FinalsCard } from '../components/FinalsCard'
import { GiveUpConfirmDialog } from '../components/GiveUpConfirmDialog'
import { NuevaInstanciaModal } from '../components/NuevaInstanciaModal'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { describeIpcError } from '../../shared/lib/ipcErrorCopy'
import type { FinalExamRecord, FinalExamResult } from '../../../shared/ipc/materias'

interface FinalesContainerProps {
  subjectId: number
  subjectName: string
  finals: FinalExamRecord[]
}

export function FinalesContainer({ subjectId, subjectName, finals }: FinalesContainerProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isGiveUpOpen, setIsGiveUpOpen] = useState(false)

  // The subject's status is derived from these rows, so every write here
  // invalidates the subject caches too — the detail header, the list badge
  // and the carreras average all read from it.
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['materias'] })
    void queryClient.invalidateQueries({ queryKey: ['materias', subjectId] })
    void queryClient.invalidateQueries({ queryKey: ['carreras'] })
  }

  const createMutation = useMutation({
    mutationFn: finalesApi.create,
    onSuccess: () => {
      invalidate()
      setIsAddOpen(false)
    }
  })

  const updateMutation = useMutation({ mutationFn: finalesApi.update, onSuccess: invalidate })
  const deleteMutation = useMutation({ mutationFn: finalesApi.delete, onSuccess: invalidate })
  // Giving up is a SUBJECT command, not a final-exam one: it writes the
  // student's decision, which no arrangement of exam rows can produce. The
  // click only OPENS `GiveUpConfirmDialog` (see `onGiveUp` below) — the
  // mutation itself fires from that dialog's `onConfirm`, never from the
  // destructive button directly.
  const giveUpMutation = useMutation({
    mutationFn: materiasApi.setOutcome,
    onSuccess: () => {
      invalidate()
      setIsGiveUpOpen(false)
    }
  })

  // The result chips and the delete button fire straight from the rows —
  // there is no dialog to carry the failure, so it surfaces as a banner next
  // to the list, the same shape as EntregasContainer's load-error line.
  // Already app-owned Spanish copy (`shared/lib/ipcErrorCopy.ts`); a retry
  // clears it because `mutate` resets the mutation's error.
  const updateError = describeIpcError(updateMutation.error)
  const deleteError = describeIpcError(deleteMutation.error)

  return (
    <>
      {updateError && <p className="text-body-lg text-destructive">{updateError}</p>}
      {deleteError && <p className="text-body-lg text-destructive">{deleteError}</p>}

      <FinalsCard
        finals={finals}
        onAdd={() => setIsAddOpen(true)}
        onSetResult={(final: FinalExamRecord, result: FinalExamResult) =>
          updateMutation.mutate({ id: final.id, label: final.label, takenOn: final.takenOn, result })
        }
        onDelete={(final: FinalExamRecord) => deleteMutation.mutate(final.id)}
        onGiveUp={() => setIsGiveUpOpen(true)}
      />

      {isAddOpen && (
        <NuevaInstanciaModal
          subjectId={subjectId}
          subjectName={subjectName}
          error={describeIpcError(createMutation.error)}
          pending={createMutation.isPending}
          onSubmit={(input) => createMutation.mutate(input)}
          onClose={() => setIsAddOpen(false)}
        />
      )}

      {isGiveUpOpen && (
        <GiveUpConfirmDialog
          subjectName={subjectName}
          error={describeIpcError(giveUpMutation.error)}
          pending={giveUpMutation.isPending}
          onConfirm={() => giveUpMutation.mutate({ id: subjectId, outcome: 'reprobada', grade: null })}
          onCancel={() => setIsGiveUpOpen(false)}
        />
      )}
    </>
  )
}
