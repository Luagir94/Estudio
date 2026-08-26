import { describe, expect, it } from 'vitest'
import type { SubjectPrerequisiteEdge } from '../../../shared/ipc/materias'
import { isPassed } from '../../materias/domain/subjectStatus'
import { type EligibilitySubject, listCandidates, type RequirementSubjectState, satisfiesLevel } from './requirements'

function state(overrides: Partial<RequirementSubjectState> = {}): RequirementSubjectState {
  return { outcome: null, regularity: null, finals: [], ...overrides }
}

describe('satisfiesLevel — aprobada', () => {
  it('is met by a subject the student closed as aprobada', () => {
    expect(satisfiesLevel(state({ outcome: 'aprobada' }), 'aprobada')).toBe(true)
  })

  // The finals path: `finalPendiente` hands the verdict to the mesas, and one
  // pass wins. Resolved through `resolveFinalsVerdict`, never re-derived here.
  it('is met by a final pendiente whose verdict resolves to approved', () => {
    expect(satisfiesLevel(state({ outcome: 'finalPendiente', finals: [{ result: 'aprobado' }] }), 'aprobada')).toBe(
      true
    )
  })

  it('is not met while the mesas are still open', () => {
    expect(satisfiesLevel(state({ outcome: 'finalPendiente', finals: [{ result: 'pendiente' }] }), 'aprobada')).toBe(
      false
    )
  })

  it('is not met when every mesa was failed', () => {
    expect(satisfiesLevel(state({ outcome: 'finalPendiente', finals: [{ result: 'reprobado' }] }), 'aprobada')).toBe(
      false
    )
  })

  it('is not met by a subject with no outcome at all', () => {
    expect(satisfiesLevel(state(), 'aprobada')).toBe(false)
  })

  // An approved mesa on a subject the student explicitly closed as reprobada
  // does NOT resurrect it: their decision is the whole point of that outcome.
  it('is not met when the student closed the subject as reprobada', () => {
    expect(satisfiesLevel(state({ outcome: 'reprobada', finals: [{ result: 'aprobado' }] }), 'aprobada')).toBe(false)
  })

  // Pinned against the app's existing "did you pass this" rule so the two can
  // never drift into different answers about the same subject.
  it('agrees with isPassed on every outcome shape', () => {
    const shapes: RequirementSubjectState[] = [
      state({ outcome: 'aprobada' }),
      state({ outcome: 'reprobada' }),
      state({ outcome: 'reprobada', finals: [{ result: 'aprobado' }] }),
      state({ outcome: 'finalPendiente', finals: [{ result: 'aprobado' }] }),
      state({ outcome: 'finalPendiente', finals: [{ result: 'reprobado' }] }),
      state({ outcome: 'finalPendiente' }),
      state()
    ]

    for (const shape of shapes) {
      expect(satisfiesLevel(shape, 'aprobada')).toBe(
        isPassed({
          outcome: shape.outcome,
          hasApprovedFinal: shape.finals.some((final) => final.result === 'aprobado')
        })
      )
    }
  })
})

describe('satisfiesLevel — regularizada', () => {
  it('is met by a regular', () => {
    expect(satisfiesLevel(state({ regularity: 'regular' }), 'regularizada')).toBe(true)
  })

  it('is met by a promocionada', () => {
    expect(satisfiesLevel(state({ regularity: 'promocionada' }), 'regularizada')).toBe(true)
  })

  // Libre is the cátedra saying you LOST the cursada — the opposite of
  // regularizada, not a weaker form of it.
  it('is not met by a libre', () => {
    expect(satisfiesLevel(state({ regularity: 'libre' }), 'regularizada')).toBe(false)
  })

  it('is not met when no condición was declared', () => {
    expect(satisfiesLevel(state(), 'regularizada')).toBe(false)
  })

  // THE implication: passing a materia is strictly stronger than regularising
  // it, so anything that satisfies `aprobada` satisfies `regularizada` too —
  // even with no condición ever recorded, which is exactly what happens to a
  // subject passed by final years later.
  it('is met by anything that satisfies aprobada, even with no condición recorded', () => {
    expect(satisfiesLevel(state({ outcome: 'aprobada' }), 'regularizada')).toBe(true)
    expect(satisfiesLevel(state({ outcome: 'finalPendiente', finals: [{ result: 'aprobado' }] }), 'regularizada')).toBe(
      true
    )
  })

  it('holds the implication for every state that satisfies aprobada', () => {
    const shapes: RequirementSubjectState[] = [
      state({ outcome: 'aprobada' }),
      state({ outcome: 'aprobada', regularity: 'libre' }),
      state({ outcome: 'finalPendiente', finals: [{ result: 'aprobado' }] }),
      state({ outcome: 'finalPendiente', finals: [{ result: 'reprobado' }] }),
      state({ regularity: 'regular' }),
      state()
    ]

    for (const shape of shapes) {
      if (satisfiesLevel(shape, 'aprobada')) {
        expect(satisfiesLevel(shape, 'regularizada')).toBe(true)
      }
    }
  })
})

function subject(
  id: number,
  name: string,
  overrides: Partial<EligibilitySubject> = {},
  prerequisites: SubjectPrerequisiteEdge[] = []
): EligibilitySubject {
  return {
    id,
    name,
    code: `COD-${id}`,
    color: '#fff',
    outcome: null,
    regularity: null,
    finals: [],
    slots: [],
    prerequisites,
    ...overrides
  }
}

describe('listCandidates', () => {
  it('marks a subject with no correlativas as habilitada', () => {
    const candidates = listCandidates([subject(1, 'Física I')], new Set())

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ state: 'habilitada', unmet: [] })
  })

  it('marks a subject whose correlativas are all met as habilitada', () => {
    const algebra = subject(1, 'Álgebra I', { outcome: 'aprobada' })
    const estructuras = subject(3, 'Estructuras de Datos', {}, [{ requiresSubjectId: 1, requiredLevel: 'aprobada' }])

    const candidates = listCandidates([algebra, estructuras], new Set())

    expect(candidates.find((candidate) => candidate.subject.id === 3)).toMatchObject({ state: 'habilitada' })
  })

  // The UI needs the REASON, not just the verdict: the approved design prints
  // "Falta Algoritmos I aprobada" on its own line under the meta.
  it('carries which requirement is unmet, and at which level', () => {
    const algoritmos = subject(1, 'Algoritmos I')
    const estructuras = subject(3, 'Estructuras de Datos', {}, [{ requiresSubjectId: 1, requiredLevel: 'aprobada' }])

    const candidates = listCandidates([algoritmos, estructuras], new Set())

    expect(candidates.find((candidate) => candidate.subject.id === 3)).toMatchObject({
      state: 'bloqueada',
      unmet: [{ subjectId: 1, subjectName: 'Algoritmos I', requiredLevel: 'aprobada' }]
    })
  })

  it('reports every unmet requirement, not only the first', () => {
    const one = subject(1, 'Algoritmos I')
    const two = subject(2, 'Análisis Matemático II')
    const target = subject(3, 'Probabilidad', {}, [
      { requiresSubjectId: 1, requiredLevel: 'aprobada' },
      { requiresSubjectId: 2, requiredLevel: 'regularizada' }
    ])

    const candidates = listCandidates([one, two, target], new Set())

    expect(candidates.find((candidate) => candidate.subject.id === 3)?.unmet).toEqual([
      { subjectId: 1, subjectName: 'Algoritmos I', requiredLevel: 'aprobada' },
      { subjectId: 2, subjectName: 'Análisis Matemático II', requiredLevel: 'regularizada' }
    ])
  })

  it('leaves out the requirements that are already met', () => {
    const met = subject(1, 'Algoritmos I', { outcome: 'aprobada' })
    const unmet = subject(2, 'Análisis Matemático II')
    const target = subject(3, 'Probabilidad', {}, [
      { requiresSubjectId: 1, requiredLevel: 'aprobada' },
      { requiresSubjectId: 2, requiredLevel: 'regularizada' }
    ])

    const candidates = listCandidates([met, unmet, target], new Set())

    expect(candidates.find((candidate) => candidate.subject.id === 3)?.unmet).toEqual([
      { subjectId: 2, subjectName: 'Análisis Matemático II', requiredLevel: 'regularizada' }
    ])
  })

  // A materia you already passed is not something to plan for the próximo
  // período.
  it('drops subjects that are already approved', () => {
    const candidates = listCandidates([subject(1, 'Álgebra I', { outcome: 'aprobada' })], new Set())

    expect(candidates).toEqual([])
  })

  it('drops a subject passed through its finals', () => {
    const passed = subject(1, 'Álgebra I', { outcome: 'finalPendiente', finals: [{ result: 'aprobado' }] })

    expect(listCandidates([passed], new Set())).toEqual([])
  })

  // Reprobada is not passed: recursarla is exactly the kind of plan this
  // screen exists for.
  it('keeps a subject the student closed as reprobada', () => {
    const candidates = listCandidates([subject(1, 'Álgebra I', { outcome: 'reprobada' })], new Set())

    expect(candidates).toHaveLength(1)
  })

  it('drops subjects already in the draft', () => {
    const candidates = listCandidates([subject(1, 'Física I'), subject(2, 'Química')], new Set([1]))

    expect(candidates.map((candidate) => candidate.subject.id)).toEqual([2])
  })

  // A correlativa naming a materia that is not in the payload cannot be
  // judged, so it is treated as UNMET. Failing open would silently habilitar a
  // materia on the strength of a rule nobody could check.
  it('treats a requirement whose subject is missing as unmet', () => {
    const target = subject(3, 'Probabilidad', {}, [{ requiresSubjectId: 99, requiredLevel: 'aprobada' }])

    expect(listCandidates([target], new Set())[0]).toMatchObject({
      state: 'bloqueada',
      unmet: [{ subjectId: 99, subjectName: null, requiredLevel: 'aprobada' }]
    })
  })
})
