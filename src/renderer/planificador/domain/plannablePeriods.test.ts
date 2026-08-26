import { describe, expect, it } from 'vitest'
import type { PeriodRecord, ProgramWithPeriods } from '../../../shared/ipc/carreras'
import { listPlannablePeriods } from './plannablePeriods'

const TODAY = new Date('2026-09-15T10:00:00')

function period(id: number, name: string, startsOn: string, endsOn: string | null): PeriodRecord {
  return { id, programId: 1, name, kind: 'cuatrimestre', startsOn, endsOn }
}

function program(periods: PeriodRecord[], name = 'Ingeniería'): ProgramWithPeriods {
  return {
    id: 1,
    name,
    institution: null,
    color: '#fff',
    gradingScheme: 'numerico',
    gradeScale: 10,
    periods,
    subjectCount: 0,
    gradedSubjects: []
  }
}

describe('listPlannablePeriods', () => {
  it('is empty when there are no carreras', () => {
    expect(listPlannablePeriods([], TODAY)).toEqual([])
  })

  // A período that already ended cannot be planned — there is nothing left to
  // decide about it.
  it('leaves out períodos that already finished', () => {
    const periods = listPlannablePeriods([program([period(1, '1er Cuatri 2026', '2026-03-01', '2026-07-31')])], TODAY)

    expect(periods).toEqual([])
  })

  it('keeps an upcoming período', () => {
    const periods = listPlannablePeriods([program([period(2, '1er Cuatri 2027', '2027-03-01', '2027-07-31')])], TODAY)

    expect(periods).toEqual([
      { id: 2, name: '1er Cuatri 2027', startsOn: '2027-03-01', endsOn: '2027-07-31', programName: 'Ingeniería' }
    ])
  })

  // The one running today is still plannable — you can add a materia to the
  // cuatrimestre you are in — but it sorts after every upcoming one, because
  // the screen is about what comes NEXT.
  it('keeps the período running today, after every upcoming one', () => {
    const periods = listPlannablePeriods(
      [program([period(1, 'En curso', '2026-08-01', '2026-12-20'), period(2, 'Próximo', '2027-03-01', '2027-07-31')])],
      TODAY
    )

    expect(periods.map((entry) => entry.name)).toEqual(['Próximo', 'En curso'])
  })

  it('orders upcoming períodos by start date', () => {
    const periods = listPlannablePeriods(
      [program([period(2, 'Segundo', '2027-08-01', '2027-12-20'), period(1, 'Primero', '2027-03-01', '2027-07-31')])],
      TODAY
    )

    expect(periods.map((entry) => entry.name)).toEqual(['Primero', 'Segundo'])
  })

  // Every carrera at once: the app has no concept of an "active carrera", so
  // the switcher must not pick one (the rule `activeTerms.ts` already states).
  it('collects períodos from every carrera', () => {
    const abogacia = program([period(5, 'Abogacía 2027', '2027-03-01', '2027-07-31')], 'Abogacía')
    const ingenieria = program([period(6, 'Ingeniería 2027', '2027-04-01', '2027-08-31')])

    const periods = listPlannablePeriods([abogacia, ingenieria], TODAY)

    expect(periods.map((entry) => entry.programName)).toEqual(['Abogacía', 'Ingeniería'])
  })

  // An open-ended período never finishes, so it stays plannable forever — the
  // same reason it never makes its subjects read "sin cerrar".
  it('keeps an open-ended período', () => {
    const periods = listPlannablePeriods([program([period(3, 'Inglés', '2024-03-01', null)])], TODAY)

    expect(periods.map((entry) => entry.id)).toEqual([3])
  })
})
