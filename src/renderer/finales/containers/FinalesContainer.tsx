// Container (design §4): owns the final-exam mutations for one subject.
// Rendered inside the subject detail, which already fetched the finals — so
// this takes them as a prop and only owns writes plus the add form.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { finalesApi } from '../adapters/finalesApi'
import { FinalsCard } from '../components/FinalsCard'
import { NuevaInstanciaModal } from '../components/NuevaInstanciaModal'
import { materiasApi } from '../../materias/adapters/materiasApi'
import type { FinalExamRecord, FinalExamResult } from '../../../shared/ipc/materias'

interface FinalesContainerProps {
  subjectId: number
  subjectName: string
  finals: FinalExamRecord[]
}

export function FinalesContainer({ subjectId, subjectName, finals }: FinalesContainerProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [isAddOpen, setIsAddOpen] = useState(false)

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
  // student's decision, which no arrangement of exam rows can produce.
  const giveUpMutation = useMutation({ mutationFn: materiasApi.setOutcome, onSuccess: invalidate })

  return (
    <>
      <FinalsCard
        finals={finals}
        onAdd={() => setIsAddOpen(true)}
        onSetResult={(final: FinalExamRecord, result: FinalExamResult) =>
          updateMutation.mutate({ id: final.id, label: final.label, takenOn: final.takenOn, result })
        }
        onDelete={(final: FinalExamRecord) => deleteMutation.mutate(final.id)}
        onGiveUp={() => giveUpMutation.mutate({ id: subjectId, outcome: 'reprobada', grade: null })}
      />

      {isAddOpen && (
        <NuevaInstanciaModal
          subjectId={subjectId}
          subjectName={subjectName}
          onSubmit={(input) => createMutation.mutate(input)}
          onClose={() => setIsAddOpen(false)}
        />
      )}
    </>
  )
}
