import { describe, expect, it } from 'vitest'
import {
  collectRequirementsOf,
  collectRequiredBy,
  type PrerequisiteEdge,
  withoutImpliedEdges,
  wouldCreateCycle
} from './prerequisiteGraph'

function edge(subjectId: number, requiresSubjectId: number): PrerequisiteEdge {
  return { subjectId, requiresSubjectId }
}

describe('wouldCreateCycle', () => {
  it('allows the first edge of an empty graph', () => {
    expect(wouldCreateCycle([], { subjectId: 2, requiresSubjectId: 1 })).toBe(false)
  })

  // The shortest cycle there is: A requires B, so B may not require A.
  it('rejects a direct back-edge', () => {
    const edges = [edge(2, 1)]

    expect(wouldCreateCycle(edges, { subjectId: 1, requiresSubjectId: 2 })).toBe(true)
  })

  // A subject requiring itself is a cycle of length one. The IPC contract
  // rejects it earlier with its own key (`prerequisite.selfReference`), but
  // the graph must not depend on that having happened.
  it('rejects a self-reference', () => {
    expect(wouldCreateCycle([], { subjectId: 3, requiresSubjectId: 3 })).toBe(true)
  })

  // C requires B requires A. Adding "A requires C" closes the loop, and the
  // proof needs a full walk — no single stored edge names it.
  it('rejects a transitive cycle', () => {
    const edges = [edge(3, 2), edge(2, 1)]

    expect(wouldCreateCycle(edges, { subjectId: 1, requiresSubjectId: 3 })).toBe(true)
  })

  it('rejects a longer transitive cycle', () => {
    const edges = [edge(5, 4), edge(4, 3), edge(3, 2), edge(2, 1)]

    expect(wouldCreateCycle(edges, { subjectId: 1, requiresSubjectId: 5 })).toBe(true)
  })

  // A diamond is NOT a cycle and must be allowed: D requires B and C, both of
  // which require A. Every path still ends at A — nothing loops back. A guard
  // that rejects this would forbid the single most ordinary shape a plan de
  // estudios has.
  it('allows a diamond, which is not a cycle', () => {
    const edges = [edge(2, 1), edge(3, 1), edge(4, 2)]

    expect(wouldCreateCycle(edges, { subjectId: 4, requiresSubjectId: 3 })).toBe(false)
  })

  // Two subjects requiring the same one is the diamond's top half, and the
  // second edge must not be mistaken for a revisit of an already-seen node.
  it('allows two subjects sharing one prerequisite', () => {
    const edges = [edge(2, 1)]

    expect(wouldCreateCycle(edges, { subjectId: 3, requiresSubjectId: 1 })).toBe(false)
  })

  it('allows an edge between two disconnected chains', () => {
    const edges = [edge(2, 1), edge(4, 3)]

    expect(wouldCreateCycle(edges, { subjectId: 3, requiresSubjectId: 2 })).toBe(false)
  })

  // The walk must TERMINATE even when the stored graph is already cyclic — a
  // database written before this guard existed, or edited by hand. Adding an
  // edge from a subject outside the loop closes nothing, so the honest answer
  // is `false`; the assertion that matters is that there is an answer at all.
  it('terminates on an already-cyclic stored graph', () => {
    const edges = [edge(1, 2), edge(2, 1)]

    expect(wouldCreateCycle(edges, { subjectId: 3, requiresSubjectId: 1 })).toBe(false)
    expect(collectRequiredBy(edges, 1)).toEqual(new Set([1, 2]))
  })
})

describe('collectRequiredBy', () => {
  // What the picker needs: everything that already depends on this subject,
  // directly or transitively, plus the subject itself. Offering any of them
  // as a new prerequisite would close a cycle.
  it('collects the subject itself when nothing depends on it', () => {
    expect(collectRequiredBy([], 1)).toEqual(new Set([1]))
  })

  it('collects direct and transitive dependents', () => {
    const edges = [edge(2, 1), edge(3, 2), edge(4, 3)]

    expect(collectRequiredBy(edges, 1)).toEqual(new Set([1, 2, 3, 4]))
  })

  it('leaves out the branch that does not depend on the subject', () => {
    const edges = [edge(2, 1), edge(4, 3)]

    expect(collectRequiredBy(edges, 1)).toEqual(new Set([1, 2]))
  })

  // Agrees with `wouldCreateCycle` by construction: an id in this set is
  // exactly an id that function would reject.
  it('agrees with wouldCreateCycle for every collected id', () => {
    const edges = [edge(2, 1), edge(3, 2)]

    for (const candidate of collectRequiredBy(edges, 1)) {
      expect(wouldCreateCycle(edges, { subjectId: 1, requiresSubjectId: candidate })).toBe(true)
    }
  })
})

// Offering a correlativa that is ALREADY implied is offering noise: if 3
// requires 2 and 2 requires 1, then 3 requires 1 by construction. Adding that
// edge changes nothing and makes the map draw a line that says what the chain
// already said.
describe('collectRequirementsOf', () => {
  it('collects the subject itself when it requires nothing', () => {
    expect(collectRequirementsOf([], 1)).toEqual(new Set([1]))
  })

  it('collects a direct requirement', () => {
    expect(collectRequirementsOf([{ subjectId: 2, requiresSubjectId: 1 }], 2)).toEqual(new Set([2, 1]))
  })

  // The whole point: 1 reaches 3 only through 2, and must still be excluded.
  it('collects a requirement reached through a chain', () => {
    const edges = [
      { subjectId: 3, requiresSubjectId: 2 },
      { subjectId: 2, requiresSubjectId: 1 }
    ]

    expect(collectRequirementsOf(edges, 3)).toEqual(new Set([3, 2, 1]))
  })

  it('collects a requirement reachable by two paths exactly once', () => {
    const edges = [
      { subjectId: 4, requiresSubjectId: 2 },
      { subjectId: 4, requiresSubjectId: 3 },
      { subjectId: 2, requiresSubjectId: 1 },
      { subjectId: 3, requiresSubjectId: 1 }
    ]

    expect(collectRequirementsOf(edges, 4)).toEqual(new Set([4, 2, 3, 1]))
  })

  it('does not collect what merely depends on the subject', () => {
    expect(collectRequirementsOf([{ subjectId: 2, requiresSubjectId: 1 }], 1)).toEqual(new Set([1]))
  })

  // Same defensive posture as `collectRequiredBy`: a database written before
  // `wouldCreateCycle` existed can still hold a loop.
  it('terminates on an edge set that is already cyclic', () => {
    const edges = [
      { subjectId: 1, requiresSubjectId: 2 },
      { subjectId: 2, requiresSubjectId: 1 }
    ]

    expect(collectRequirementsOf(edges, 1)).toEqual(new Set([1, 2]))
  })
})

describe('withoutImpliedEdges', () => {
  it('keeps a graph that says nothing twice', () => {
    const edges: PrerequisiteEdge[] = [
      { subjectId: 2, requiresSubjectId: 1 },
      { subjectId: 3, requiresSubjectId: 2 }
    ]

    expect(withoutImpliedEdges(edges)).toEqual(edges)
  })

  // The shape the seed used to hold: 3 requires 2, 2 requires 1, and 3 names 1
  // as well. The chain already said it.
  it('drops the shortcut across a chain and keeps the chain', () => {
    const edges: PrerequisiteEdge[] = [
      { subjectId: 2, requiresSubjectId: 1 },
      { subjectId: 3, requiresSubjectId: 2 },
      { subjectId: 3, requiresSubjectId: 1 }
    ]

    expect(withoutImpliedEdges(edges)).toEqual([
      { subjectId: 2, requiresSubjectId: 1 },
      { subjectId: 3, requiresSubjectId: 2 }
    ])
  })

  it('drops a shortcut across a longer chain', () => {
    const edges: PrerequisiteEdge[] = [
      { subjectId: 2, requiresSubjectId: 1 },
      { subjectId: 3, requiresSubjectId: 2 },
      { subjectId: 4, requiresSubjectId: 3 },
      { subjectId: 4, requiresSubjectId: 1 }
    ]

    expect(withoutImpliedEdges(edges)).toEqual([
      { subjectId: 2, requiresSubjectId: 1 },
      { subjectId: 3, requiresSubjectId: 2 },
      { subjectId: 4, requiresSubjectId: 3 }
    ])
  })

  // Both branches reach 1, so 4 → 1 is implied twice over. Neither branch may
  // be mistaken for the shortcut and dropped in its place.
  it('drops the shortcut across a diamond and keeps both branches', () => {
    const edges: PrerequisiteEdge[] = [
      { subjectId: 2, requiresSubjectId: 1 },
      { subjectId: 3, requiresSubjectId: 1 },
      { subjectId: 4, requiresSubjectId: 2 },
      { subjectId: 4, requiresSubjectId: 3 },
      { subjectId: 4, requiresSubjectId: 1 }
    ]

    expect(withoutImpliedEdges(edges)).toEqual([
      { subjectId: 2, requiresSubjectId: 1 },
      { subjectId: 3, requiresSubjectId: 1 },
      { subjectId: 4, requiresSubjectId: 2 },
      { subjectId: 4, requiresSubjectId: 3 }
    ])
  })

  // A duplicate implies itself through its twin, so a naive filter drops BOTH
  // and loses the correlativa entirely. One copy has to survive.
  it('collapses a duplicated correlativa to one instead of losing it', () => {
    const edges: PrerequisiteEdge[] = [
      { subjectId: 2, requiresSubjectId: 1 },
      { subjectId: 2, requiresSubjectId: 1 }
    ]

    expect(withoutImpliedEdges(edges)).toEqual([{ subjectId: 2, requiresSubjectId: 1 }])
  })

  // A stored graph written before `wouldCreateCycle` existed can hold a loop.
  // Every edge in it is implied by the rest, and returning nothing would erase
  // the very correlativas that need looking at.
  it('leaves a cyclic graph alone rather than emptying it', () => {
    const edges: PrerequisiteEdge[] = [
      { subjectId: 2, requiresSubjectId: 1 },
      { subjectId: 1, requiresSubjectId: 2 }
    ]

    expect(withoutImpliedEdges(edges)).toEqual(edges)
  })

  it('has nothing to do with an empty graph', () => {
    expect(withoutImpliedEdges([])).toEqual([])
  })
})
