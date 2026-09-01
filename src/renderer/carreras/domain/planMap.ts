// Pure, framework-free layout for the plan de estudios map (the "Plan de
// estudios" tab of a carrera). MUST NOT import electron or better-sqlite3 —
// enforced by tooling/dependencyGuard.mts's no-electron-or-sqlite-in-domain
// rule.
//
// This module answers ONE question: given the materias of a carrera and the
// correlativas between them, where does each box go?
//
// The load-bearing decision is that the COLUMN IS NOT COMPUTED. It is the
// materia's `nivel`, a stored field the student assigns. Two derivations are
// tempting and both are wrong:
//
//   - From the período. That is the student's own timeline, not the carrera's
//     plan; drawing it would turn a map of the plan into a picture of one
//     person's history, and every materia not yet cursada has no período at
//     all.
//   - From depth in the correlativa graph. A materia can sit at the END of the
//     plan and require nothing whatsoever — a práctica profesional, a
//     seminario — and topological depth would march it into the first column
//     as if it were introductory.
//
// What IS computed is the vertical order inside each column, because nobody
// should have to place boxes by hand. That is a median (barycenter) sweep, the
// ordering phase of the standard layered-graph method.

import { type PlanOrderSubject, resolvePlanOrder } from '../../../shared/domain/planOrder'

/** A materia as the map needs it: an identity and its place in the plan. */
export type PlanMapSubject = PlanOrderSubject

/** One correlativa, in the direction the schema stores it. */
export interface PlanMapEdge {
  /** The subject that HAS the requirement. */
  subjectId: number
  /** The subject that IS the requirement. */
  requiresSubjectId: number
}

/** Where one box lands. Both coordinates are indexes, never pixels. */
export interface PlanMapNode {
  id: number
  /** Index into `PlanMapLayout.columns`, NOT the nivel itself. */
  column: number
  row: number
}

export interface PlanMapLayout {
  /**
   * The niveles present, ascending. A plan that jumps 1 → 5 yields `[1, 5]`
   * and two adjacent columns: the gap is not information this map can fill,
   * and three empty columns would be an invention.
   */
  columns: number[]
  nodes: PlanMapNode[]
}

/** How many iterations of the ordering sweep to run. */
const SWEEPS = 4

/**
 * Crossings between two adjacent columns under the given row orders.
 *
 * `upper` and `lower` are id lists in row order; an edge participates only
 * when its prerequisite is in `upper` and its dependent is in `lower`. Two
 * edges cross when their endpoints run in opposite directions, which is
 * exactly the pair count below.
 *
 * Exported because it is the measure the sweep optimises, and a heuristic
 * whose objective function cannot be tested independently is a heuristic
 * nobody can trust.
 */
export function countCrossings(
  upper: readonly number[],
  lower: readonly number[],
  edges: readonly PlanMapEdge[]
): number {
  const upperIndex = new Map(upper.map((id, index) => [id, index]))
  const lowerIndex = new Map(lower.map((id, index) => [id, index]))

  const pairs: { from: number; to: number }[] = []
  for (const edge of edges) {
    const from = upperIndex.get(edge.requiresSubjectId)
    const to = lowerIndex.get(edge.subjectId)
    if (from !== undefined && to !== undefined) {
      pairs.push({ from, to })
    }
  }

  let crossings = 0
  pairs.forEach((a, index) => {
    for (const b of pairs.slice(index + 1)) {
      if ((a.from - b.from) * (a.to - b.to) < 0) {
        crossings += 1
      }
    }
  })
  return crossings
}

/** Median of a sorted-on-the-fly list; `-1` when there is nothing to average. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const high = sorted[middle]
  if (high === undefined) {
    return -1
  }
  if (sorted.length % 2 === 1) {
    return high
  }
  return ((sorted[middle - 1] ?? high) + high) / 2
}

/**
 * Reorder one column by the median of its neighbours' rows.
 *
 * A node with no neighbour in the reference direction keeps its current index
 * as its key, so it stays where it is instead of collapsing to the top — the
 * standard treatment, and the one that keeps a materia without correlativas
 * from drifting every time an unrelated edge is added.
 */
function orderByMedian(column: number[], neighboursOf: (id: number) => number[]): number[] {
  const keyed = column.map((id, index) => {
    const neighbourMedian = median(neighboursOf(id))
    return { id, index, key: neighbourMedian === -1 ? index : neighbourMedian }
  })
  // Stable on ties by falling back to the previous index, which is what makes
  // the whole layout deterministic.
  keyed.sort((a, b) => a.key - b.key || a.index - b.index)
  return keyed.map((entry) => entry.id)
}

function totalCrossings(columns: number[][], edges: readonly PlanMapEdge[]): number {
  let total = 0
  for (let i = 0; i + 1 < columns.length; i += 1) {
    const upper = columns[i]
    const lower = columns[i + 1]
    if (upper !== undefined && lower !== undefined) {
      total += countCrossings(upper, lower, edges)
    }
  }
  return total
}

/**
 * Place every materia of a carrera on the map.
 *
 * Columns come from `nivel`; rows come from a median sweep over the
 * correlativas. Subjects with no nivel are returned separately.
 *
 * Two robustness notes, both deliberate:
 *
 *   - Edges naming a subject that is not on the canvas (in the tray, or absent
 *     from the payload entirely) are ignored rather than fatal. A correlativa
 *     the map cannot draw is not a reason to refuse to draw the map.
 *   - Edges that run BACKWARDS — prerequisite in a later column than its
 *     dependent — take no part in the ordering. `wouldCreateCycle` keeps the
 *     stored graph acyclic, but a database written before that guard existed
 *     can still hold a loop, and a layout that hangs is worse than one that is
 *     merely ugly. The sweep runs a fixed number of passes, so termination
 *     never depends on the graph's shape.
 */
export function layOutPlanMap(subjects: readonly PlanMapSubject[], edges: readonly PlanMapEdge[]): PlanMapLayout {
  // Columns come from the RESOLVED order, never from the raw `nivel`: a materia
  // with correlativas is placed by them, and reading its stored value here is
  // what used to let one sit before something it requires.
  // Every materia resolves: one with correlativas is placed by them, and one
  // without falls back to its own value or the first column. There is no
  // "unplaced" state left for a tray to hold.
  const order = resolvePlanOrder(subjects, edges)
  const placed = subjects.filter((subject) => order.has(subject.id))

  const niveles = [...new Set(placed.map((subject) => order.get(subject.id) as number))].sort((a, b) => a - b)
  const columns = niveles.map((nivel) =>
    placed.filter((subject) => order.get(subject.id) === nivel).map((subject) => subject.id)
  )

  const columnOf = new Map<number, number>()
  columns.forEach((column, index) => {
    for (const id of column) {
      columnOf.set(id, index)
    }
  })

  // Only forward edges steer the layout; see the note above.
  const forward = edges.filter((edge) => {
    const from = columnOf.get(edge.requiresSubjectId)
    const to = columnOf.get(edge.subjectId)
    return from !== undefined && to !== undefined && from < to
  })

  const predecessors = new Map<number, number[]>()
  const successors = new Map<number, number[]>()
  for (const edge of forward) {
    predecessors.set(edge.subjectId, [...(predecessors.get(edge.subjectId) ?? []), edge.requiresSubjectId])
    successors.set(edge.requiresSubjectId, [...(successors.get(edge.requiresSubjectId) ?? []), edge.subjectId])
  }

  /** Row positions of `ids` in whatever column each currently sits in. */
  const rowsOf = (current: number[][], ids: number[]): number[] =>
    ids
      .map((id) => {
        const column = columnOf.get(id)
        return column === undefined ? -1 : (current[column]?.indexOf(id) ?? -1)
      })
      .filter((row) => row >= 0)

  let best = columns.map((column) => [...column])
  let bestCrossings = totalCrossings(best, forward)

  for (let sweep = 0; sweep < SWEEPS && bestCrossings > 0; sweep += 1) {
    // Forward: settle each column against everything to its left.
    for (let i = 1; i < columns.length; i += 1) {
      const column = columns[i]
      if (column !== undefined) {
        columns[i] = orderByMedian(column, (id) => rowsOf(columns, predecessors.get(id) ?? []))
      }
    }
    // Backward: settle each column against everything to its right.
    for (let i = columns.length - 2; i >= 0; i -= 1) {
      const column = columns[i]
      if (column !== undefined) {
        columns[i] = orderByMedian(column, (id) => rowsOf(columns, successors.get(id) ?? []))
      }
    }

    const crossings = totalCrossings(columns, forward)
    if (crossings < bestCrossings) {
      bestCrossings = crossings
      best = columns.map((column) => [...column])
    }
  }

  const nodes: PlanMapNode[] = []
  best.forEach((column, columnIndex) => {
    column.forEach((id, row) => {
      nodes.push({ id, column: columnIndex, row })
    })
  })

  return { columns: niveles, nodes }
}
