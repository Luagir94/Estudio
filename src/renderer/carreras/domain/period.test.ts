import { describe, expect, it } from 'vitest'
import {
  createPeriod,
  derivePeriodYear,
  formatPeriodRange,
  listCurrentPeriods,
  periodStatus,
  periodsOverlap,
  pickDefaultPeriodId
} from './period'

const validInput = {
  programId: 1,
  name: '2do Cuatrimestre 2026',
  kind: 'cuatrimestre',
  startsOn: '2026-08-12',
  endsOn: '2026-12-04'
}

describe('createPeriod', () => {
  it('accepts a period whose dates are explicit and ordered', () => {
    const result = createPeriod(validInput)

    expect(result).toEqual({ ok: true, period: validInput })
  })

  it('accepts a period that crosses the calendar year', () => {
    const result = createPeriod({
      ...validInput,
      name: 'Cohorte Nov 2026',
      kind: 'curso',
      startsOn: '2026-11-03',
      endsOn: '2027-03-15'
    })

    expect(result.ok).toBe(true)
  })

  it('accepts an open-ended period, for classes that simply do not stop', () => {
    const result = createPeriod({
      ...validInput,
      name: 'Clases de inglés',
      kind: 'clases',
      endsOn: null
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.period.endsOn).toBeNull()
  })

  it('treats a missing end date as open-ended rather than as an error', () => {
    const { endsOn, ...withoutEnd } = validInput
    void endsOn

    const result = createPeriod(withoutEnd)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.period.endsOn).toBeNull()
  })

  it('rejects an end date that is not after the start date', () => {
    const result = createPeriod({ ...validInput, endsOn: '2026-08-11' })

    expect(result).toEqual({
      ok: false,
      errors: [{ path: ['endsOn'], message: 'endsOn must be after startsOn' }]
    })
  })

  it('rejects a zero-length period', () => {
    const result = createPeriod({ ...validInput, endsOn: validInput.startsOn })

    expect(result.ok).toBe(false)
  })

  it('rejects a date that carries a time or an offset', () => {
    const result = createPeriod({ ...validInput, startsOn: '2026-08-12T00:00' })

    expect(result.ok).toBe(false)
  })

  it('requires a name and a kind', () => {
    const result = createPeriod({ ...validInput, name: '   ', kind: '' })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.errors.map((issue) => issue.path)).toEqual([['name'], ['kind']])
  })
})

describe('derivePeriodYear', () => {
  it('takes the year from the start date', () => {
    expect(derivePeriodYear('2026-03-09')).toBe(2026)
  })

  it('keeps the starting year for a period that ends in the next one', () => {
    expect(derivePeriodYear('2026-11-03')).toBe(2026)
  })
})

describe('periodStatus', () => {
  const period = { startsOn: '2026-08-12', endsOn: '2026-12-04' }

  it('is proximo before the start date', () => {
    expect(periodStatus(period, new Date(2026, 7, 11))).toBe('proximo')
  })

  it('is activo on the start date', () => {
    expect(periodStatus(period, new Date(2026, 7, 12))).toBe('activo')
  })

  it('is activo inside the range', () => {
    expect(periodStatus(period, new Date(2026, 8, 30))).toBe('activo')
  })

  it('is activo on the end date', () => {
    expect(periodStatus(period, new Date(2026, 11, 4))).toBe('activo')
  })

  it('is finalizado after the end date', () => {
    expect(periodStatus(period, new Date(2026, 11, 5))).toBe('finalizado')
  })

  it('is activo in January for a period that started the previous November', () => {
    const course = { startsOn: '2026-11-03', endsOn: '2027-03-15' }

    expect(periodStatus(course, new Date(2027, 0, 20))).toBe('activo')
  })

  it('never finishes an open-ended period', () => {
    const englishClasses = { startsOn: '2024-03-04', endsOn: null }

    expect(periodStatus(englishClasses, new Date(2031, 5, 1))).toBe('activo')
  })

  it('still reports an open-ended period as proximo before it starts', () => {
    const englishClasses = { startsOn: '2026-09-01', endsOn: null }

    expect(periodStatus(englishClasses, new Date(2026, 7, 15))).toBe('proximo')
  })
})

describe('periodsOverlap', () => {
  const cuatrimestre = { startsOn: '2026-08-12', endsOn: '2026-12-04' }

  it('reports an annual period overlapping a cuatrimestre', () => {
    expect(periodsOverlap({ startsOn: '2026-03-09', endsOn: '2026-11-20' }, cuatrimestre)).toBe(true)
  })

  it('reports two consecutive cuatrimestres as not overlapping', () => {
    expect(periodsOverlap({ startsOn: '2026-03-09', endsOn: '2026-07-18' }, cuatrimestre)).toBe(false)
  })

  it('counts a single shared day as an overlap', () => {
    expect(periodsOverlap({ startsOn: '2026-03-09', endsOn: '2026-08-12' }, cuatrimestre)).toBe(true)
  })

  it('is symmetric', () => {
    const anual = { startsOn: '2026-03-09', endsOn: '2026-11-20' }

    expect(periodsOverlap(anual, cuatrimestre)).toBe(periodsOverlap(cuatrimestre, anual))
  })

  it('overlaps anything that starts after an open-ended period began', () => {
    const englishClasses = { startsOn: '2024-03-04', endsOn: null }

    expect(periodsOverlap(englishClasses, cuatrimestre)).toBe(true)
    expect(periodsOverlap(cuatrimestre, englishClasses)).toBe(true)
  })

  it('does not overlap a period that ended before an open-ended one began', () => {
    const englishClasses = { startsOn: '2026-09-01', endsOn: null }

    expect(periodsOverlap(englishClasses, { startsOn: '2026-03-09', endsOn: '2026-07-18' })).toBe(false)
  })
})

describe('formatPeriodRange', () => {
  it('prints the year once when both dates share it', () => {
    expect(formatPeriodRange('2026-08-12', '2026-12-04')).toBe('12 ago – 04 dic 2026')
  })

  it('prints both years when the period crosses the calendar year', () => {
    expect(formatPeriodRange('2026-11-03', '2027-03-15')).toBe('03 nov 2026 – 15 mar 2027')
  })

  it('prints an open start when the period has no end', () => {
    expect(formatPeriodRange('2024-03-04', null)).toBe('Desde 04 mar 2024')
  })
})

describe('pickDefaultPeriodId', () => {
  const today = new Date(2026, 7, 15)
  const cuatri1 = { id: 1, startsOn: '2026-03-09', endsOn: '2026-07-18' }
  const anual = { id: 2, startsOn: '2026-03-09', endsOn: '2026-11-20' }
  const cuatri2 = { id: 3, startsOn: '2026-08-12', endsOn: '2026-12-04' }
  const proximo = { id: 4, startsOn: '2027-03-08', endsOn: '2027-07-17' }
  const abiertoViejo = { id: 5, startsOn: '2024-03-04', endsOn: null }

  it('has nothing to pick without periods', () => {
    expect(pickDefaultPeriodId([], today)).toBeNull()
  })

  it('picks the only active period', () => {
    expect(pickDefaultPeriodId([cuatri1, cuatri2], today)).toBe(cuatri2.id)
  })

  it('never picks a period that already ended', () => {
    expect(pickDefaultPeriodId([cuatri1], today)).toBeNull()
  })

  it('never picks a period that has not started', () => {
    expect(pickDefaultPeriodId([proximo], today)).toBeNull()
  })

  it('prefers the most recently started among several active ones', () => {
    expect(pickDefaultPeriodId([anual, cuatri2], today)).toBe(cuatri2.id)
  })

  // The Anual vs cuatrimestre case: both start on the same day, and the
  // cuatrimestre is the more specific answer.
  it('prefers the shorter period when two started the same day', () => {
    const marchToday = new Date(2026, 2, 20)

    expect(pickDefaultPeriodId([anual, cuatri1], marchToday)).toBe(cuatri1.id)
  })

  it('never lets an open-ended period beat a dated one that started the same day', () => {
    const sameDayOpen = { id: 6, startsOn: cuatri2.startsOn, endsOn: null }

    expect(pickDefaultPeriodId([sameDayOpen, cuatri2], today)).toBe(cuatri2.id)
  })

  it('still picks an open-ended period when it is the only active one', () => {
    expect(pickDefaultPeriodId([cuatri1, abiertoViejo], today)).toBe(abiertoViejo.id)
  })
})

describe('listCurrentPeriods', () => {
  const today = new Date(2026, 5, 15)
  const cuatri1 = { id: 1, startsOn: '2026-03-09', endsOn: '2026-07-18' }
  const anual = { id: 2, startsOn: '2026-03-09', endsOn: '2026-11-20' }
  const pasado = { id: 3, startsOn: '2026-01-05', endsOn: '2026-02-27' }
  const proximo = { id: 4, startsOn: '2026-08-12', endsOn: '2026-12-04' }
  const abierto = { id: 5, startsOn: '2024-03-04', endsOn: null }

  it('lists only the periods covering today, the one ending soonest first', () => {
    expect(listCurrentPeriods([anual, pasado, cuatri1, proximo], today).map((period) => period.id)).toEqual([1, 2])
  })

  it('sorts an open-ended period last — it frames the year, it does not name the moment', () => {
    expect(listCurrentPeriods([abierto, cuatri1], today).map((period) => period.id)).toEqual([1, 5])
  })

  it('lists nothing when nothing is active', () => {
    expect(listCurrentPeriods([pasado, proximo], today)).toEqual([])
  })
})
