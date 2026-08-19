import { describe, expect, it } from 'vitest'
import { periodKindSchema } from '../../../shared/ipc/carreras'
import { PERIOD_KINDS, divisionsPerYear, isPeriodKind, periodNameOptions } from './periodKind'

describe('PERIOD_KINDS', () => {
  it('is the same list the IPC contract validates against', () => {
    expect([...PERIOD_KINDS]).toEqual([...periodKindSchema.options])
  })
})

describe('divisionsPerYear', () => {
  it('splits the year the way each kind names itself', () => {
    expect(divisionsPerYear('anual')).toBe(1)
    expect(divisionsPerYear('cuatrimestre')).toBe(2)
    expect(divisionsPerYear('trimestre')).toBe(3)
    expect(divisionsPerYear('bimestre')).toBe(4)
    expect(divisionsPerYear('mensual')).toBe(12)
  })

  it('reports no division for a curso, which does not tile the year', () => {
    expect(divisionsPerYear('curso')).toBeNull()
  })
})

describe('periodNameOptions', () => {
  it('offers one name per division, in calendar order', () => {
    expect(periodNameOptions('cuatrimestre')).toEqual(['1er cuatrimestre', '2do cuatrimestre'])
    expect(periodNameOptions('trimestre')).toEqual(['1er trimestre', '2do trimestre', '3er trimestre'])
    expect(periodNameOptions('bimestre')).toEqual(['1er bimestre', '2do bimestre', '3er bimestre', '4to bimestre'])
  })

  it('does not number a year that is not divided', () => {
    expect(periodNameOptions('anual')).toEqual(['Anual'])
  })

  it('names the twelve divisions of a year after the months, because that is what they are', () => {
    const options = periodNameOptions('mensual')

    expect(options).toHaveLength(12)
    expect(options[0]).toBe('Enero')
    expect(options[11]).toBe('Diciembre')
  })

  it('gives a curso a single unnumbered name', () => {
    expect(periodNameOptions('curso')).toEqual(['Curso'])
  })

  it('never offers a name that repeats within a kind', () => {
    for (const kind of PERIOD_KINDS) {
      const options = periodNameOptions(kind)
      expect(new Set(options).size).toBe(options.length)
    }
  })
})

describe('isPeriodKind', () => {
  it('recognises every catalogued kind', () => {
    for (const kind of PERIOD_KINDS) {
      expect(isPeriodKind(kind)).toBe(true)
    }
  })

  // Periods created before the catalogue existed hold free text. They must be
  // detectable so the edit form can ask for a deliberate re-pick instead of
  // silently rewriting them to the nearest catalogued kind.
  it('rejects the free text older periods were saved with', () => {
    expect(isPeriodKind('clases')).toBe(false)
    expect(isPeriodKind('ddd')).toBe(false)
    expect(isPeriodKind('')).toBe(false)
    expect(isPeriodKind('Cuatrimestre')).toBe(false)
  })
})
