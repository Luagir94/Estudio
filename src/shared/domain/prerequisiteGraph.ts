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
