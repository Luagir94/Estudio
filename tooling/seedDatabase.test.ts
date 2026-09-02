import { describe, expect, it } from 'vitest'
import { collectRequirementsOf } from '../src/shared/domain/prerequisiteGraph'
import { buildSeedData, type SeedProgram, type SeedSubject } from './seedDatabase.mts'

// A fixed Wednesday, so weekday-derived assertions (attendance, slots) are
// stable regardless of when the suite runs.
const TODAY = new Date(2026, 8, 2)

function allSubjects(programs: SeedProgram[]): SeedSubject[] {
  return programs.flatMap((program) => program.subjects)
}

function isoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

describe('buildSeedData', () => {
  it('is deterministic for the same day', () => {
    expect(buildSeedData(TODAY)).toEqual(buildSeedData(TODAY))
  })

  it('anchors the dataset to the given day rather than to a hardcoded year', () => {
    const later = buildSeedData(new Date(2031, 8, 2))
    const periodNames = later.programs[0].periods.map((period) => period.name)

    expect(periodNames.some((name) => name.includes('2031'))).toBe(true)
    expect(periodNames.some((name) => name.includes('2026'))).toBe(false)
  })

  it('puts every cuatrimestre on the academic calendar, never in the summer break', () => {
    // Checked across a whole year of run dates: the neighbouring períodos are
    // derived from the day the seed runs, so a February run must not produce a
    // cuatrimestre starting in January.
    for (let month = 0; month < 12; month += 1) {
      const program = buildSeedData(new Date(2026, month, 15)).programs[0]
      const cuatrimestres = program.periods.filter((period) => period.kind === 'cuatrimestre')
      const names = cuatrimestres.map((period) => period.name)

      expect(new Set(names).size).toBe(names.length)
      for (const period of cuatrimestres) {
        const startMonth = Number(period.startsOn.slice(5, 7))
        // The one in progress is anchored to `today` and may legitimately start
        // anywhere; the calendar-derived ones start in March or in August.
        if (period.name !== cuatrimestres[2].name) {
          expect([3, 8]).toContain(startMonth)
        }
      }
    }
  })

  it('gives every program a scheme its gradeScale agrees with', () => {
    for (const program of buildSeedData(TODAY).programs) {
      if (program.gradingScheme === 'numerico') {
        expect(program.gradeScale).toBeTypeOf('number')
      } else {
        expect(program.gradeScale).toBeNull()
      }
    }
  })

  it('never puts a grade on a subject of a binario program', () => {
    const binario = buildSeedData(TODAY).programs.filter((program) => program.gradingScheme === 'binario')

    for (const subject of allSubjects(binario)) {
      expect(subject.grade).toBeNull()
      expect(subject.partialExams.every((exam) => exam.grade === null)).toBe(true)
      expect(subject.finalExams.every((exam) => exam.grade === null)).toBe(true)
    }
  })

  it('writes every calendar date as a local ISO day', () => {
    const data = buildSeedData(TODAY)

    for (const program of data.programs) {
      for (const period of program.periods) {
        expect(period.startsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(period.endsOn === null || /^\d{4}-\d{2}-\d{2}$/.test(period.endsOn)).toBe(true)
      }
      for (const academicDate of program.academicDates) {
        expect(academicDate.startsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
    for (const subject of allSubjects(data.programs)) {
      for (const deadline of subject.deadlines) {
        expect(deadline.dueAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      }
    }
  })

  it('leaves work on both sides of today so Hoy and Entregas have something to show', () => {
    const deadlines = allSubjects(buildSeedData(TODAY).programs).flatMap((subject) => subject.deadlines)
    const today = isoDate(TODAY)

    expect(deadlines.some((deadline) => deadline.dueAt < today && deadline.done)).toBe(true)
    expect(deadlines.some((deadline) => deadline.dueAt < today && !deadline.done)).toBe(true)
    expect(deadlines.some((deadline) => deadline.dueAt > today)).toBe(true)
  })

  it('records one attendance mark per class day at most', () => {
    for (const subject of allSubjects(buildSeedData(TODAY).programs)) {
      const dates = subject.attendance.map((record) => record.date)
      expect(new Set(dates).size).toBe(dates.length)
      expect(dates.every((date) => date <= isoDate(TODAY))).toBe(true)
    }
  })

  it('only marks attendance on a day the subject actually has a class', () => {
    for (const subject of allSubjects(buildSeedData(TODAY).programs)) {
      const classDays = new Set(subject.slots.map((slot) => slot.dayOfWeek))
      for (const record of subject.attendance) {
        expect(classDays.has(new Date(`${record.date}T00:00`).getDay())).toBe(true)
      }
    }
  })

  it('points every correlativa and planner entry at rows the dataset defines', () => {
    for (const program of buildSeedData(TODAY).programs) {
      const codes = new Set(program.subjects.map((subject) => subject.code))
      const periodNames = new Set(program.periods.map((period) => period.name))

      for (const edge of program.prerequisites) {
        expect(codes.has(edge.subjectCode)).toBe(true)
        expect(codes.has(edge.requiresSubjectCode)).toBe(true)
        expect(edge.subjectCode).not.toBe(edge.requiresSubjectCode)
      }
      for (const entry of program.plannerEntries) {
        expect(codes.has(entry.subjectCode)).toBe(true)
        expect(periodNames.has(entry.periodName)).toBe(true)
      }
      for (const subject of program.subjects) {
        expect(subject.periodName === null || periodNames.has(subject.periodName)).toBe(true)
      }
    }
  })

  // A correlativa the chain already implies is one the app's own picker would
  // never OFFER: `collectRequirementsOf` subtracts it. Seeding one produces a
  // plan the student could not have typed, and a plan map that draws a line
  // whose whole content two other lines already said.
  it('declares no correlativa another correlativa already implies', () => {
    for (const program of buildSeedData(TODAY).programs) {
      // The domain rule is written against ids, so the codes borrow one each.
      // Which number a code gets is irrelevant; only the graph shape matters.
      const idOf = new Map(program.subjects.map((subject, index) => [subject.code, index + 1]))
      const edges = program.prerequisites.map((edge) => ({
        subjectId: idOf.get(edge.subjectCode) as number,
        requiresSubjectId: idOf.get(edge.requiresSubjectCode) as number
      }))

      edges.forEach((edge, index) => {
        const rest = edges.filter((_, other) => other !== index)
        expect(collectRequirementsOf(rest, edge.subjectId).has(edge.requiresSubjectId)).toBe(false)
      })
    }
  })

  it('keeps the correlativa graph acyclic', () => {
    // The app's own `wouldCreateCycle` guard would reject a cyclic seed, so a
    // cycle here would produce data the planner can never have made.
    for (const program of buildSeedData(TODAY).programs) {
      const requirements = new Map<string, string[]>()
      for (const edge of program.prerequisites) {
        requirements.set(edge.subjectCode, [...(requirements.get(edge.subjectCode) ?? []), edge.requiresSubjectCode])
      }

      const settled = new Set<string>()
      const visiting = new Set<string>()
      const walk = (code: string): void => {
        if (settled.has(code)) return
        expect(visiting.has(code)).toBe(false)
        visiting.add(code)
        for (const required of requirements.get(code) ?? []) walk(required)
        visiting.delete(code)
        settled.add(code)
      }
      for (const code of requirements.keys()) walk(code)
    }
  })
})
