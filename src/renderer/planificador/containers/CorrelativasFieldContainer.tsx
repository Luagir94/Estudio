// Container (design §4) for the CORRELATIVAS field inside "Editar materia".
//
// It exists because correlativas have their OWN lifecycle and their own
// channels, exactly like parciales and mesas de final: the modal's submit is
// the aggregate write for the subject's DEFINITION, and a correlativa is not
// part of that definition. So each change here is applied when it is made —
// this is not a draft the "Guardar cambios" button collects, and the modal's
// "Cancelar" does not roll it back, the same way closing the modal never
// un-records a parcial.
//
// The candidate list is computed with the SAME pure guard main runs before
// writing (`shared/domain/prerequisiteGraph.ts`), which is the whole reason
// that rule lives in `shared/`: the picker must never offer an edge the write
// path would then refuse.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { collectRequiredBy, type PrerequisiteEdge } from '../../../shared/domain/prerequisiteGraph'
import type { SubjectPrerequisite } from '../../../shared/ipc/materias'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { planificadorApi } from '../adapters/planificadorApi'
import { CorrelativasField } from '../components/CorrelativasField'

interface CorrelativasFieldContainerProps {
  subjectId: number
  /** The rows as `materias:detail` already delivered them — no second fetch for what the modal has. */
  prerequisites: SubjectPrerequisite[]
}

export function CorrelativasFieldContainer({
  subjectId,
  prerequisites
}: CorrelativasFieldContainerProps): React.JSX.Element {
  const queryClient = useQueryClient()

  // The SAME ['materias'] cache the list screen owns. It carries every
  // subject's name AND its correlativa edges, which is exactly the two things
  // the picker needs — so this costs no round trip of its own and refreshes on
  // the same invalidation the mutations below fire.
  const { data: subjects } = useQuery({ queryKey: ['materias'], queryFn: materiasApi.list })

  const candidates = useMemo(() => {
    const all = subjects ?? []
    const edges: PrerequisiteEdge[] = all.flatMap((subject) =>
      subject.prerequisites.map((prerequisite) => ({
        subjectId: subject.id,
        requiresSubjectId: prerequisite.requiresSubjectId
      }))
    )
    // Everything that already depends on this materia, plus the materia
    // itself — precisely the set a new correlativa may not come from.
    const wouldClose = collectRequiredBy(edges, subjectId)
    const alreadyRequired = new Set(prerequisites.map((prerequisite) => prerequisite.requires.id))
    return all
      .filter((subject) => !wouldClose.has(subject.id) && !alreadyRequired.has(subject.id))
      .map((subject) => ({ id: subject.id, name: subject.name }))
  }, [subjects, subjectId, prerequisites])

  // ONE invalidation for all three writes: a correlativa is a fact both
  // subject payloads carry, so the CORRELATIVAS card on the screen behind this
  // modal and the Planificador's habilitada/bloqueada verdicts both follow
  // from the same key.
  function invalidateSubjects(): void {
    void queryClient.invalidateQueries({ queryKey: ['materias'] })
  }

  const addMutation = useMutation({ mutationFn: planificadorApi.addPrerequisite, onSuccess: invalidateSubjects })
  const updateMutation = useMutation({ mutationFn: planificadorApi.updatePrerequisite, onSuccess: invalidateSubjects })
  const removeMutation = useMutation({ mutationFn: planificadorApi.removePrerequisite, onSuccess: invalidateSubjects })

  return (
    <CorrelativasField
      prerequisites={prerequisites}
      candidates={candidates}
      onAdd={(input) => addMutation.mutate({ subjectId, ...input })}
      onChangeLevel={(input) => updateMutation.mutate(input)}
      onRemove={(id) => removeMutation.mutate(id)}
    />
  )
}
