import { describe, expect, it } from 'vitest'
import { listActiveTerms } from './activeTerms'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'

const TODAY = new Date('2026-04-10T12:00:00')

function program(name: string, periods: { id: number; name: string; startsOn: string; endsOn: string | null }[]) {
  return {
    id: periods[0]?.id ?? 1,
    name,
    institution: null,
    color: '#4C8DFF',
    gradingScheme: 'numeric',
    gradeScale: 10,
    subjectCount: 0,
    gradedSubjects: [],
    periods: periods.map((period) => ({ ...period, programId: 1, kind: 'cuatrimestre' }))
  } as unknown as ProgramWithPeriods
}

describe('listActiveTerms', () => {
  it('is empty when there are no programs', () => {
    expect(listActiveTerms([], TODAY)).toEqual([])
  })

  it('is empty when no period covers today', () => {
    const programs = [
      program('Abogacía', [{ id: 1, name: '2do cuatri', startsOn: '2025-08-12', endsOn: '2025-12-06' }])
    ]

    expect(listActiveTerms(programs, TODAY)).toEqual([])
  })

  it('names the carrera and período when exactly one is running', () => {
    const programs = [
      program('Abogacía', [
        { id: 1, name: '2do cuatrimestre 2025', startsOn: '2025-08-12', endsOn: '2025-12-06' },
        { id: 2, name: '1er cuatrimestre', startsOn: '2026-03-09', endsOn: '2026-07-18' }
      ])
    ]

    expect(listActiveTerms(programs, TODAY)).toEqual([{ programName: 'Abogacía', periodName: '1er cuatrimestre' }])
  })

  // The whole reason this returns a LIST. An "Anual" running alongside a
  // cuatrimestre is two periods, and the app has no notion of one of them
  // being the real one — picking a winner here would invent it.
  it('returns BOTH when an anual overlaps a cuatrimestre in the same carrera', () => {
    const programs = [
      program('Abogacía', [
        { id: 1, name: 'Anual 2026', startsOn: '2026-03-09', endsOn: '2026-11-20' },
        { id: 2, name: '1er cuatrimestre', startsOn: '2026-03-09', endsOn: '2026-07-18' }
      ])
    ]

    expect(listActiveTerms(programs, TODAY)).toHaveLength(2)
  })

  it('returns one entry per carrera when several are being cursadas at once', () => {
    const programs = [
      program('Abogacía', [{ id: 1, name: '1er cuatrimestre', startsOn: '2026-03-09', endsOn: '2026-07-18' }]),
      program('Inglés', [{ id: 2, name: 'Módulo 3', startsOn: '2026-03-30', endsOn: '2026-06-30' }]),
      program('Fotografía', [{ id: 3, name: 'Cursada 2025', startsOn: '2025-01-05', endsOn: '2025-11-20' }])
    ]

    expect(listActiveTerms(programs, TODAY)).toEqual([
      { programName: 'Abogacía', periodName: '1er cuatrimestre' },
      { programName: 'Inglés', periodName: 'Módulo 3' }
    ])
  })

  it('counts an open-ended period as running', () => {
    const programs = [program('Inglés', [{ id: 1, name: 'Clases', startsOn: '2024-03-04', endsOn: null }])]

    expect(listActiveTerms(programs, TODAY)).toEqual([{ programName: 'Inglés', periodName: 'Clases' }])
  })

  it('skips programs with no periods', () => {
    const programs = [
      program('Sin períodos', []),
      program('Abogacía', [{ id: 2, name: '1er cuatrimestre', startsOn: '2026-03-09', endsOn: '2026-07-18' }])
    ]

    expect(listActiveTerms(programs, TODAY)).toHaveLength(1)
  })
})
