import { describe, expect, it } from 'vitest'
import { collectRequiredBy, type PrerequisiteEdge, wouldCreateCycle } from './prerequisiteGraph'

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
