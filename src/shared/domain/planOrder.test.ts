import { describe, expect, it } from 'vitest'
import { type PlanOrderSubject, resolvePlanOrder } from './planOrder'

function subject(id: number, nivel: number | null): PlanOrderSubject {
  return { id, nivel }
}

function requires(subjectId: number, requiresSubjectId: number): { subjectId: number; requiresSubjectId: number } {
  return { subjectId, requiresSubjectId }
}

// The rule that makes the contradiction impossible instead of merely invalid:
// a materia with correlativas takes its place FROM them. Nothing can sit before
// something it requires, because its position is computed from that thing.
describe('resolvePlanOrder', () => {
  const orderOf = (
    subjects: PlanOrderSubject[],
    edges: { subjectId: number; requiresSubjectId: number }[],
    id: number
  ) => resolvePlanOrder(subjects, edges).get(id)

  it('gives a materia that requires nothing the order it was assigned', () => {
    expect(orderOf([subject(1, 4)], [], 1)).toBe(4)
  })

  it('defaults an unassigned root to the first column', () => {
    expect(orderOf([subject(1, null)], [], 1)).toBe(1)
  })

  it('puts a materia one column past its correlativa', () => {
    const subjects = [subject(1, null), subject(2, null)]

    expect(orderOf(subjects, [requires(2, 1)], 2)).toBe(2)
  })

  // The bug this rule removes: a materia sitting BEFORE something it requires.
  // Its own stored nivel is not consulted at all once it has a correlativa.
  it('ignores a stored order that would put a materia before its correlativa', () => {
    const subjects = [subject(1, 3), subject(2, 1)]

    expect(orderOf(subjects, [requires(2, 1)], 2)).toBe(4)
  })

  it('follows the DEEPEST correlativa when there are several', () => {
    const subjects = [subject(1, 1), subject(2, 5), subject(3, null)]

    expect(orderOf(subjects, [requires(3, 1), requires(3, 2)], 3)).toBe(6)
  })

  it('carries an order down a chain', () => {
    const subjects = [subject(1, 2), subject(2, null), subject(3, null)]
    const order = resolvePlanOrder(subjects, [requires(2, 1), requires(3, 2)])

    expect([order.get(1), order.get(2), order.get(3)]).toEqual([2, 3, 4])
  })

  it('ignores a correlativa pointing outside the carrera', () => {
    expect(orderOf([subject(1, null)], [requires(1, 99)], 1)).toBe(1)
  })

  it('terminates on an edge set that is already cyclic', () => {
    const order = resolvePlanOrder([subject(1, null), subject(2, null)], [requires(1, 2), requires(2, 1)])

    expect(order.size).toBe(2)
  })
})
