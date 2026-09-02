// Pure, framework-free graph rules for correlativas. Lives in `shared/domain`
// — not in a renderer slice — for the same reason `grading.ts` does: BOTH
// sides need the identical answer. Main runs it before writing an edge
// (`planificador:addPrerequisite`), and the renderer runs it to decide which
// subjects the "Agregar correlativa" picker may even offer. Two copies of this
// rule would eventually disagree, and the disagreement would show up as a
// picker offering an option the write path then refuses.
//
// The graph is the EDGE SET, nothing more: no subject rows, no names, no
// levels. `requiredLevel` cannot make a cycle legal or illegal, so it has no
// business here.

/** One correlativa edge: `subjectId` may not be cursada until `requiresSubjectId` is met. */
export interface PrerequisiteEdge {
  /** The subject that HAS the requirement. */
  subjectId: number
  /** The subject that IS the requirement. */
  requiresSubjectId: number
}

/**
 * Every subject that depends on `subjectId` — directly or through any chain —
 * PLUS `subjectId` itself.
 *
 * This is exactly the set a new prerequisite of `subjectId` may not come from:
 * requiring something that (transitively) already requires you closes a loop,
 * and requiring yourself is a loop of length one. The picker subtracts this
 * set from its options, so the affordance never offers an edge the write path
 * would reject.
 *
 * Walks the edges backwards (dependent ← prerequisite) with an explicit stack
 * and a visited set, so it terminates even on a stored graph that is ALREADY
 * cyclic — a database written before this guard existed, or edited by hand.
 */
export function collectRequiredBy(edges: readonly PrerequisiteEdge[], subjectId: number): Set<number> {
  const collected = new Set<number>([subjectId])
  const pending = [subjectId]

  while (pending.length > 0) {
    // Non-null: `pending.length > 0` was just checked, and nothing else pops.
    const current = pending.pop() as number
    for (const edge of edges) {
      if (edge.requiresSubjectId !== current || collected.has(edge.subjectId)) {
        continue
      }
      collected.add(edge.subjectId)
      pending.push(edge.subjectId)
    }
  }

  return collected
}

/**
 * Whether adding `candidate` to `edges` would make a subject (transitively)
 * require itself.
 *
 * A cycle is not a strict rule the student violated — it is a plan de estudios
 * that cannot be walked in any order, so no materia in the loop could ever be
 * cursada. Rejecting it is the only honest answer; storing it would produce a
 * planner that blocks every subject in the cycle forever with no way out.
 *
 * A self-reference is included on purpose rather than assumed away: the IPC
 * contract rejects it earlier with its own machine key
 * (`prerequisite.selfReference`, a clearer message for a clearly different
 * mistake), but this function must not depend on that having run.
 */
export function wouldCreateCycle(edges: readonly PrerequisiteEdge[], candidate: PrerequisiteEdge): boolean {
  return collectRequiredBy(edges, candidate.subjectId).has(candidate.requiresSubjectId)
}

/**
 * Every subject `subjectId` requires — directly or through any chain — PLUS
 * `subjectId` itself.
 *
 * This is the set a new correlativa is REDUNDANT with. If 3 requires 2 and 2
 * requires 1, then 3 already requires 1: the chain says it. Storing that edge
 * too changes no verdict `satisfiesLevel` reaches, and it makes the plan map
 * draw a line whose only content is what the two other lines already said.
 *
 * The mirror of `collectRequiredBy`, walked the other way (dependent →
 * prerequisite), with the same explicit stack and visited set — so it
 * terminates on a stored graph that is ALREADY cyclic, the way a database
 * written before `wouldCreateCycle` existed can be.
 *
 * NOT a validation rule: a redundant correlativa is noise, not a contradiction,
 * and the write path keeps accepting one. This narrows what the picker OFFERS.
 */
export function collectRequirementsOf(edges: readonly PrerequisiteEdge[], subjectId: number): Set<number> {
  const collected = new Set<number>([subjectId])
  const pending = [subjectId]

  while (pending.length > 0) {
    // Non-null: `pending.length > 0` was just checked, and nothing else pops.
    const current = pending.pop() as number
    for (const edge of edges) {
      if (edge.subjectId !== current || collected.has(edge.requiresSubjectId)) {
        continue
      }
      collected.add(edge.requiresSubjectId)
      pending.push(edge.requiresSubjectId)
    }
  }

  return collected
}

/** `subjectId`/`requiresSubjectId` as one comparable value. */
function edgeKey(edge: PrerequisiteEdge): string {
  return `${edge.subjectId}-${edge.requiresSubjectId}`
}

/**
 * The same graph with every correlativa another correlativa already implies
 * taken out — a transitive reduction, in the standard name.
 *
 * The picker refuses to OFFER such an edge (`collectRequirementsOf` is exactly
 * the set it subtracts), but the WRITE path still accepts one: a redundant
 * correlativa is noise, not a contradiction, and a database can hold one from
 * before that filter existed, from a hand edit, or from a seed. So anything
 * that DRAWS the graph has to reduce it itself rather than trust its input.
 *
 * Not a validation rule and not a repair: nothing is deleted from the database.
 * This is for the plan map, where an implied edge draws a line whose only
 * content is what two other lines already said — and, worse, a line that has to
 * travel a lane around the boxes in between to get there.
 *
 * Two shapes it must survive, both of which a naive filter gets wrong:
 *
 *   - A DUPLICATE implies itself through its twin, so filtering each edge
 *     against all the others drops BOTH and loses the correlativa. The dedupe
 *     below runs first for that reason, not for tidiness.
 *   - A CYCLE makes every edge in the loop implied by the rest. Emptying it
 *     would hide precisely the correlativas someone needs to look at, so the
 *     walk is the one in `collectRequirementsOf`, which stops at the edges it
 *     is given and therefore leaves a loop standing.
 */
export function withoutImpliedEdges(edges: readonly PrerequisiteEdge[]): PrerequisiteEdge[] {
  const seen = new Set<string>()
  const unique = edges.filter((edge) => {
    const key = edgeKey(edge)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })

  return unique.filter((edge, index) => {
    const rest = unique.filter((_, other) => other !== index)
    return !collectRequirementsOf(rest, edge.subjectId).has(edge.requiresSubjectId)
  })
}
