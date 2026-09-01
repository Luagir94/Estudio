// Pure, framework-free plan-de-estudios ordering. Lives in `shared/domain` —
// not in a renderer slice — for the same reason `prerequisiteGraph.ts` does:
// MORE THAN ONE side needs the identical answer. The carreras slice draws the
// map from it, and the planificador's correlativa picker decides what to offer
// from it. Two copies would eventually disagree, and the disagreement would
// show up as a picker offering an edge the map then draws as a jump.
//
// MUST NOT import electron or better-sqlite3 — enforced by
// tooling/dependencyGuard.mts's no-electron-or-sqlite-in-domain rule.
import type { PrerequisiteEdge } from './prerequisiteGraph'

/** A materia as the ordering needs it: an identity and its own assigned place. */
export interface PlanOrderSubject {
  id: number
  /** Only consulted when the materia requires NOTHING. `null` = first column. */
  nivel: number | null
}

/**
 * The effective order of every materia — the map's columns.
 *
 * THE RULE, and the reason the map can no longer contradict itself: a materia
 * that HAS correlativas takes its place FROM them, one column past the deepest
 * one. Its own stored `nivel` is not consulted at all. A materia cannot sit
 * before something it requires, because its position is computed from that
 * thing rather than validated against it.
 *
 * Manual input survives exactly where the graph knows nothing: a materia that
 * requires NOTHING. That is the case `nivel` exists for — a práctica
 * profesional at the end of a plan depends on no correlativa, and only the
 * student can say it is not a first-column materia.
 *
 * An unassigned root falls in column 1. It requires nothing, so it genuinely
 * CAN be cursada first; the field is how you say otherwise.
 *
 * Depth is memoised over a DFS where a back-edge contributes nothing.
 * `wouldCreateCycle` keeps the stored graph acyclic, but a database written
 * before that guard existed can still hold a loop, and a map that hangs is
 * worse than one that is merely wrong.
 */
export function resolvePlanOrder(
  subjects: readonly PlanOrderSubject[],
  edges: readonly PrerequisiteEdge[]
): Map<number, number> {
  const known = new Map(subjects.map((subject) => [subject.id, subject]))

  const prerequisites = new Map<number, number[]>()
  for (const edge of edges) {
    if (!known.has(edge.subjectId) || !known.has(edge.requiresSubjectId)) {
      continue
    }
    prerequisites.set(edge.subjectId, [...(prerequisites.get(edge.subjectId) ?? []), edge.requiresSubjectId])
  }

  const settled = new Map<number, number>()
  const visiting = new Set<number>()

  function orderOf(id: number): number {
    const cached = settled.get(id)
    if (cached !== undefined) {
      return cached
    }
    if (visiting.has(id)) {
      return 0
    }

    const required = prerequisites.get(id) ?? []
    if (required.length === 0) {
      // A root: the student's own value, or the first column.
      const order = known.get(id)?.nivel ?? 1
      settled.set(id, order)
      return order
    }

    visiting.add(id)
    const deepest = required.reduce((highest, other) => Math.max(highest, orderOf(other)), 0)
    visiting.delete(id)

    const order = deepest + 1
    settled.set(id, order)
    return order
  }

  return new Map(subjects.map((subject) => [subject.id, orderOf(subject.id)]))
}
