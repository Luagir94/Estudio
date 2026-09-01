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
import {
  collectRequiredBy,
  collectRequirementsOf,
  type PrerequisiteEdge
} from '../../../shared/domain/prerequisiteGraph'
import { resolvePlanOrder } from '../../../shared/domain/planOrder'
import type { SubjectPrerequisite } from '../../../shared/ipc/materias'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { planificadorApi } from '../adapters/planificadorApi'
import { CorrelativasField } from '../components/CorrelativasField'

interface CorrelativasFieldContainerProps {
  subjectId: number
  /** The rows as `materias:detail` already delivered them — no second fetch for what the modal has. */
  prerequisites: SubjectPrerequisite[]
  /** Forwarded verbatim: which of the two approved field designs to draw. */
  variant?: 'default' | 'compact'
}

export function CorrelativasFieldContainer({
  subjectId,
  prerequisites,
  variant
}: CorrelativasFieldContainerProps): React.JSX.Element {
  const queryClient = useQueryClient()

  // The SAME ['materias'] cache the list screen owns. It carries every
  // subject's name AND its correlativa edges, which is exactly the two things
  // the picker needs — so this costs no round trip of its own and refreshes on
  // the same invalidation the mutations below fire.
  const { data: subjects } = useQuery({ queryKey: ['materias'], queryFn: materiasApi.list })

  const candidates = useMemo(() => {
    const all = subjects ?? []
    const edges: PrerequisiteEdge[] = [
      ...all.flatMap((subject) =>
        subject.prerequisites.map((prerequisite) => ({
          subjectId: subject.id,
          requiresSubjectId: prerequisite.requiresSubjectId
        }))
      ),
      // This materia's OWN correlativas come from the `materias:detail` payload
      // the modal already holds, which lands before the ['materias'] list
      // refetch does. Reading them only from the list would let the picker
      // offer, for one render, a materia that was just added.
      ...prerequisites.map((prerequisite) => ({
        subjectId,
        requiresSubjectId: prerequisite.requires.id
      }))
    ]
    // Everything that already depends on this materia, plus the materia
    // itself — precisely the set a new correlativa may not come from.
    const wouldClose = collectRequiredBy(edges, subjectId)
    // Everything this materia ALREADY requires, directly or through a chain.
    // If 3 requires 2 and 2 requires 1, then 3 requires 1 by construction:
    // offering that edge offers noise. It would change no verdict and would
    // make the plan map draw a line whose only content is what the two lines
    // beside it already said.
    //
    // This subsumes the direct correlativas, which is why they no longer need
    // a set of their own.
    const alreadyImplied = collectRequirementsOf(edges, subjectId)

    // A materia's place on the map comes from its DEEPEST correlativa, so a
    // shallower one moves nothing — it only adds an edge that has to jump over
    // whatever sits between. Once this materia requires something in column 2,
    // column 1 stops being on offer.
    //
    // Only forward: an edge added in the other order is already stored, and
    // this narrows what can be ADDED rather than deleting what the student
    // already decided.
    const order = resolvePlanOrder(all, edges)
    const deepestRequired = prerequisites.reduce(
      (deepest, prerequisite) => Math.max(deepest, order.get(prerequisite.requires.id) ?? 0),
      0
    )

    return all
      .filter(
        (subject) =>
          !wouldClose.has(subject.id) &&
          !alreadyImplied.has(subject.id) &&
          (order.get(subject.id) ?? 0) >= deepestRequired
      )
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
      variant={variant}
      onAdd={(input) => addMutation.mutate({ subjectId, ...input })}
      onChangeLevel={(input) => updateMutation.mutate(input)}
      onRemove={(id) => removeMutation.mutate(id)}
    />
  )
}
