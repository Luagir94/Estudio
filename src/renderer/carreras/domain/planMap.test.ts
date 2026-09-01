import { describe, expect, it } from 'vitest'
import { countCrossings, layOutPlanMap, type PlanMapSubject } from './planMap'

/** Terse fixture builder — the tests are about position, not about names. */
function subject(id: number, nivel: number | null): PlanMapSubject {
  return { id, nivel }
}

/** `a` requires `b`. Reads in the same direction the schema stores it. */
function requires(subjectId: number, requiresSubjectId: number): { subjectId: number; requiresSubjectId: number } {
  return { subjectId, requiresSubjectId }
}

/** Row of `id` in the laid-out map, or `null` when it is not on the canvas. */
function rowOf(layout: ReturnType<typeof layOutPlanMap>, id: number): number | null {
  return layout.nodes.find((node) => node.id === id)?.row ?? null
}

function columnOf(layout: ReturnType<typeof layOutPlanMap>, id: number): number | null {
  return layout.nodes.find((node) => node.id === id)?.column ?? null
}

describe('layOutPlanMap — columns', () => {
  it('returns an empty layout for no subjects', () => {
    expect(layOutPlanMap([], [])).toEqual({ columns: [], nodes: [] })
  })

  it('builds one column per distinct nivel, ascending', () => {
    const layout = layOutPlanMap([subject(1, 2), subject(2, 1), subject(3, 2)], [])

    expect(layout.columns).toEqual([1, 2])
    expect(columnOf(layout, 2)).toBe(0)
    expect(columnOf(layout, 1)).toBe(1)
    expect(columnOf(layout, 3)).toBe(1)
  })

  // A plan that jumps 1 → 5 does not get three empty columns rendered into it.
  // The columns ARE the niveles present; the gap is not information the map has
  // any way to fill.
  it('collapses gaps between niveles instead of rendering empty columns', () => {
    const layout = layOutPlanMap([subject(1, 1), subject(2, 5)], [])

    expect(layout.columns).toEqual([1, 5])
    expect(columnOf(layout, 2)).toBe(1)
  })

  // The whole reason `nivel` is a stored field instead of a derived one. A
  // práctica profesional sits at the end of the plan and requires nothing; a
  // layout that read the graph would march it to the first column and tell the
  // student they can take it today.
  it('keeps a subject with no correlativas in its own nivel', () => {
    const layout = layOutPlanMap([subject(1, 1), subject(2, 4)], [])

    expect(columnOf(layout, 2)).toBe(1)
    expect(layout.columns).toEqual([1, 4])
  })

  // A materia that requires nothing CAN be cursada first, so an unassigned one
  // sits in the first column rather than in limbo. The manual field exists to
  // say "no, this one is really fourth year".
  it('places a materia with no correlativas and no order in the first column', () => {
    const layout = layOutPlanMap([subject(1, 1), subject(2, null), subject(3, null)], [])

    expect(columnOf(layout, 2)).toBe(0)
    expect(columnOf(layout, 3)).toBe(0)
  })

  // An edge may point at a subject that is not in the payload at all. That is
  // not a reason to throw, nor to drop the node that carries it.
  it('ignores a correlativa pointing outside the carrera', () => {
    const layout = layOutPlanMap([subject(1, 1), subject(2, null)], [requires(1, 99)])

    expect(layout.nodes.map((node) => node.id).sort()).toEqual([1, 2])
  })
})

describe('layOutPlanMap — vertical order', () => {
  // The canonical crossing: input order puts A above B and X above Y, but A
  // requires nothing and Y requires B while X requires A... the two edges cross
  // unless the second column is reordered.
  it('reorders a column so its edges stop crossing', () => {
    const subjects = [subject(1, 1), subject(2, 1), subject(3, 2), subject(4, 2)]
    // 3 requires 2 (the LOWER of column 1), 4 requires 1 (the upper one).
    const edges = [requires(3, 2), requires(4, 1)]

    const crossingInput = countCrossings([1, 2], [3, 4], edges)
    expect(crossingInput).toBe(1)

    const layout = layOutPlanMap(subjects, edges)
    // 4 hangs off the top node, so it rises above 3.
    expect(rowOf(layout, 4)).toBe(0)
    expect(rowOf(layout, 3)).toBe(1)
  })

  it('gives every node in a column a distinct, gapless row', () => {
    const subjects = [subject(1, 1), subject(2, 1), subject(3, 1), subject(4, 2)]
    const layout = layOutPlanMap(subjects, [requires(4, 3)])

    const firstColumn = layout.nodes.filter((node) => node.column === 0).map((node) => node.row)
    expect([...firstColumn].sort((a, b) => a - b)).toEqual([0, 1, 2])
  })

  it('is deterministic — the same input lays out the same way twice', () => {
    const subjects = [subject(1, 1), subject(2, 1), subject(3, 2), subject(4, 2), subject(5, 3)]
    const edges = [requires(3, 2), requires(4, 1), requires(5, 3), requires(5, 4)]

    expect(layOutPlanMap(subjects, edges)).toEqual(layOutPlanMap(subjects, edges))
  })

  // `wouldCreateCycle` keeps the stored graph acyclic, but this module must not
  // depend on that having run: a database written before that guard existed can
  // still hold a loop, and a layout that hangs is worse than one that is ugly.
  it('terminates on an edge set that is already cyclic', () => {
    const subjects = [subject(1, 1), subject(2, 2)]
    const layout = layOutPlanMap(subjects, [requires(1, 2), requires(2, 1)])

    expect(layout.nodes).toHaveLength(2)
  })
})

describe('countCrossings', () => {
  it('counts nothing when edges run in parallel', () => {
    expect(countCrossings([1, 2], [3, 4], [requires(3, 1), requires(4, 2)])).toBe(0)
  })

  it('counts one crossing for a single swap', () => {
    expect(countCrossings([1, 2], [3, 4], [requires(4, 1), requires(3, 2)])).toBe(1)
  })

  it('counts every crossing pair, not just the first', () => {
    // Full reversal of three edges crosses three times.
    expect(countCrossings([1, 2, 3], [4, 5, 6], [requires(6, 1), requires(5, 2), requires(4, 3)])).toBe(3)
  })
})
