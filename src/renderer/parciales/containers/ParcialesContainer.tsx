// Container (design §4): owns the parcial mutations for one subject.
// Rendered inside the subject detail, which already fetched the parciales —
// so this takes them as a prop and only owns writes plus the form.
//
// One modal serves creation AND editing, and the row is the only way into the
// edit mode; the delete fires from that same modal's footer. That is the
// whole write surface for parciales.
//
// What this container deliberately does NOT do is touch the subject's
// `regularity`. Recording a parcial changes no condición — the cátedra's
// verdict is a separate, stored fact, and inferring it from these rows is the
// exact mistake the feature exists to avoid.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { parcialesApi } from '../adapters/parcialesApi'
import { NuevoParcialModal } from '../components/NuevoParcialModal'
import { ParcialesSection } from '../components/ParcialesSection'
import { describeIpcError } from '../../shared/lib/ipcErrorCopy'
import type { PartialExamRecord } from '../../../shared/ipc/materias'

interface ParcialesContainerProps {
  subjectId: number
  subjectName: string
  parciales: PartialExamRecord[]
}

export function ParcialesContainer({ subjectId, subjectName, parciales }: ParcialesContainerProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingParcial, setEditingParcial] = useState<PartialExamRecord | null>(null)

  // ONLY the subject detail — narrower than the finales container's fan-out
  // on purpose. Nothing outside this screen is derived from parciales: not
  // the subject's estado, not the Materias list badge, not the carreras
  // average. Invalidating those would be pretending otherwise.
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['materias', 'detail', subjectId] })
  }

  const createMutation = useMutation({
    mutationFn: parcialesApi.create,
    onSuccess: () => {
      invalidate()
      setIsAddOpen(false)
    }
  })

  const updateMutation = useMutation({
    mutationFn: parcialesApi.update,
    onSuccess: () => {
      invalidate()
      setEditingParcial(null)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: parcialesApi.delete,
    onSuccess: () => {
      invalidate()
      setEditingParcial(null)
    }
  })

  return (
    <>
      <ParcialesSection
        parciales={parciales}
        onAdd={() => setIsAddOpen(true)}
        onEdit={(parcial) => setEditingParcial(parcial)}
      />

      {isAddOpen && (
        <NuevoParcialModal
          mode="create"
          subjectId={subjectId}
          subjectName={subjectName}
          error={describeIpcError(createMutation.error)}
          pending={createMutation.isPending}
          onSubmit={(input) => createMutation.mutate(input)}
          onClose={() => setIsAddOpen(false)}
        />
      )}

      {editingParcial && (
        <NuevoParcialModal
          mode="edit"
          subjectId={subjectId}
          subjectName={subjectName}
          defaultValues={{
            label: editingParcial.label,
            takenOn: editingParcial.takenOn,
            result: editingParcial.result,
            grade: editingParcial.grade
          }}
          // Whichever of the two writes failed — they cannot be in flight at
          // the same time, and both belong to this one dialog.
          error={describeIpcError(updateMutation.error ?? deleteMutation.error)}
          pending={updateMutation.isPending || deleteMutation.isPending}
          onSubmit={(input) => updateMutation.mutate({ ...input, id: editingParcial.id })}
          onDelete={() => deleteMutation.mutate(editingParcial.id)}
          onClose={() => setEditingParcial(null)}
        />
      )}
    </>
  )
}
