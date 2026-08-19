import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { finalExams, periods, subjects } from '../../db/schema'
import { createSqliteProgramRepository } from './sqliteProgramRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

// Goes through the PRODUCTION connection factory and migrator, so the
// `foreign_keys` pragma that makes ON DELETE CASCADE / SET NULL work is the
// real one (same precedent as sqliteDeadlineRepository.test.ts).
function createTestDb() {
  const { db } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

const abogacia = {
  name: 'Abogacía',
  institution: 'Universidad de Buenos Aires',
  color: '#4C8DFF',
  gradingScheme: 'numerico' as const,
  gradeScale: 10
}

const bartender = {
  name: 'Curso de Bartender',
  institution: null,
  color: '#FB923C',
  gradingScheme: 'binario' as const,
  gradeScale: null
}

describe('createSqliteProgramRepository', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('create persists the grading scheme and its scale', () => {
    const repository = createSqliteProgramRepository(db)

    const created = repository.create(abogacia)

    expect(created).toMatchObject({
      name: 'Abogacía',
      institution: 'Universidad de Buenos Aires',
      gradingScheme: 'numerico',
      gradeScale: 10
    })
  })

  it('create keeps a pass/fail program free of a scale', () => {
    const repository = createSqliteProgramRepository(db)

    expect(repository.create(bartender)).toMatchObject({
      gradingScheme: 'binario',
      gradeScale: null,
      institution: null
    })
  })

  it('list returns every program with no periods when none were created', () => {
    const repository = createSqliteProgramRepository(db)
    repository.create(abogacia)
    repository.create(bartender)

    const listed = repository.list()

    expect(listed).toHaveLength(2)
    expect(listed[0]).toMatchObject({ periods: [], subjectCount: 0, gradedSubjects: [] })
  })

  it('createPeriod stores an open-ended period as a null end date', () => {
    const repository = createSqliteProgramRepository(db)
    const program = repository.create(bartender)

    const period = repository.createPeriod({
      programId: program.id,
      name: 'Clases',
      kind: 'curso',
      startsOn: '2024-03-04',
      endsOn: null
    })

    expect(period).toMatchObject({ name: 'Clases', startsOn: '2024-03-04', endsOn: null })
  })

  it('list sorts each program periods chronologically', () => {
    const repository = createSqliteProgramRepository(db)
    const program = repository.create(abogacia)
    const base = { programId: program.id, kind: 'cuatrimestre' as const }
    repository.createPeriod({ ...base, name: '2do 2026', startsOn: '2026-08-12', endsOn: '2026-12-04' })
    repository.createPeriod({ ...base, name: '1er 2026', startsOn: '2026-03-09', endsOn: '2026-07-18' })

    const listed = repository.list()

    expect(listed[0].periods.map((period) => period.name)).toEqual(['1er 2026', '2do 2026'])
  })

  it('rolls subjects up to their program through their period', () => {
    const repository = createSqliteProgramRepository(db)
    const program = repository.create(abogacia)
    const period = repository.createPeriod({
      programId: program.id,
      name: '1er 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-18'
    })
    db.insert(subjects)
      .values({
        name: 'Derecho Romano',
        code: 'DR-101',
        color: '#fff',
        periodId: period.id,
        grade: 8,
        outcome: 'aprobada'
      })
      .run()

    const listed = repository.list()

    expect(listed[0].subjectCount).toBe(1)
    expect(listed[0].gradedSubjects).toEqual([{ grade: 8, outcome: 'aprobada', hasApprovedFinal: false }])
  })

  it('leaves a subject with no period out of every program', () => {
    const repository = createSqliteProgramRepository(db)
    repository.create(abogacia)
    db.insert(subjects).values({ name: 'Suelta', code: 'X-1', color: '#fff' }).run()

    expect(repository.list()[0].subjectCount).toBe(0)
  })

  it('reports whether a subject has an approved final without deciding if it passed', () => {
    const repository = createSqliteProgramRepository(db)
    const program = repository.create(abogacia)
    const period = repository.createPeriod({
      programId: program.id,
      name: '1er 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-18'
    })
    const subject = db
      .insert(subjects)
      .values({ name: 'Teoría', code: 'TE-1', color: '#fff', periodId: period.id, outcome: 'finalPendiente' })
      .returning()
      .get()
    db.insert(finalExams).values({ subjectId: subject.id, label: '1ra', result: 'reprobado' }).run()
    db.insert(finalExams).values({ subjectId: subject.id, label: '2da', result: 'aprobado' }).run()

    expect(repository.list()[0].gradedSubjects).toEqual([
      { grade: null, outcome: 'finalPendiente', hasApprovedFinal: true }
    ])
  })

  it('updatePeriod corrects the name, kind and dates', () => {
    const repository = createSqliteProgramRepository(db)
    const program = repository.create(abogacia)
    const period = repository.createPeriod({
      programId: program.id,
      name: '1er 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-18'
    })

    const updated = repository.updatePeriod({
      id: period.id,
      name: '1er Cuatrimestre 2026',
      kind: 'anual',
      startsOn: '2026-03-16',
      endsOn: '2026-07-04'
    })

    expect(updated).toEqual({
      id: period.id,
      programId: program.id,
      name: '1er Cuatrimestre 2026',
      kind: 'anual',
      startsOn: '2026-03-16',
      endsOn: '2026-07-04'
    })
  })

  it('updatePeriod can turn a closed period into an open-ended one', () => {
    const repository = createSqliteProgramRepository(db)
    const program = repository.create(bartender)
    const period = repository.createPeriod({
      programId: program.id,
      name: 'Clases',
      kind: 'curso',
      startsOn: '2024-03-04',
      endsOn: '2024-12-04'
    })

    expect(
      repository.updatePeriod({ id: period.id, name: 'Clases', kind: 'curso', startsOn: '2024-03-04', endsOn: null })
    ).toMatchObject({ endsOn: null })
  })

  it('updatePeriod keeps the subjects recorded under the period', () => {
    const repository = createSqliteProgramRepository(db)
    const program = repository.create(abogacia)
    const period = repository.createPeriod({
      programId: program.id,
      name: '1er 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-18'
    })
    db.insert(subjects).values({ name: 'Derecho Romano', code: 'DR-101', color: '#fff', periodId: period.id }).run()

    repository.updatePeriod({
      id: period.id,
      name: '1er 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-16',
      endsOn: '2026-07-04'
    })

    expect(repository.detail(program.id)?.subjectCount).toBe(1)
  })

  it('updatePeriod returns null for an unknown period', () => {
    expect(
      createSqliteProgramRepository(db).updatePeriod({
        id: 999,
        name: 'X',
        kind: 'cuatrimestre',
        startsOn: '2026-03-09',
        endsOn: null
      })
    ).toBeNull()
  })

  it('removePeriod deletes only that period and leaves its subjects unassigned', () => {
    const repository = createSqliteProgramRepository(db)
    const program = repository.create(abogacia)
    const first = repository.createPeriod({
      programId: program.id,
      name: '1er 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-18'
    })
    repository.createPeriod({
      programId: program.id,
      name: '2do 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-08-12',
      endsOn: '2026-12-04'
    })
    db.insert(subjects).values({ name: 'Derecho Romano', code: 'DR-101', color: '#fff', periodId: first.id }).run()

    const result = repository.removePeriod(first.id)

    expect(result).toEqual({ id: first.id, unlinkedSubjects: 1 })
    expect(
      db
        .select()
        .from(periods)
        .all()
        .map((row) => row.name)
    ).toEqual(['2do 2026'])
    const survivors = db.select().from(subjects).all()
    expect(survivors).toHaveLength(1)
    expect(survivors[0].periodId).toBeNull()
  })

  it('removePeriod reports no subjects for an empty period', () => {
    const repository = createSqliteProgramRepository(db)
    const program = repository.create(bartender)
    const period = repository.createPeriod({
      programId: program.id,
      name: 'Clases',
      kind: 'curso',
      startsOn: '2024-03-04',
      endsOn: null
    })

    expect(repository.removePeriod(period.id)).toEqual({ id: period.id, unlinkedSubjects: 0 })
  })

  it('removePeriod returns null for an unknown period', () => {
    expect(createSqliteProgramRepository(db).removePeriod(999)).toBeNull()
  })

  it('detail returns null for an unknown program', () => {
    expect(createSqliteProgramRepository(db).detail(999)).toBeNull()
  })

  it('detail returns only the requested program', () => {
    const repository = createSqliteProgramRepository(db)
    repository.create(abogacia)
    const second = repository.create(bartender)

    expect(repository.detail(second.id)).toMatchObject({ id: second.id, name: 'Curso de Bartender' })
  })

  it('remove deletes the program and cascades its periods', () => {
    const repository = createSqliteProgramRepository(db)
    const program = repository.create(abogacia)
    repository.createPeriod({
      programId: program.id,
      name: '1er 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-18'
    })

    const result = repository.remove(program.id)

    expect(result).toEqual({ id: program.id, deletedPeriods: 1, unlinkedSubjects: 0 })
    expect(db.select().from(periods).all()).toHaveLength(0)
  })

  it('remove keeps the subjects and only unlinks them from the deleted period', () => {
    const repository = createSqliteProgramRepository(db)
    const program = repository.create(abogacia)
    const period = repository.createPeriod({
      programId: program.id,
      name: '1er 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-18'
    })
    db.insert(subjects).values({ name: 'Derecho Romano', code: 'DR-101', color: '#fff', periodId: period.id }).run()

    const result = repository.remove(program.id)

    expect(result).toMatchObject({ deletedPeriods: 1, unlinkedSubjects: 1 })
    const survivors = db.select().from(subjects).all()
    expect(survivors).toHaveLength(1)
    expect(survivors[0].periodId).toBeNull()
  })

  it('remove returns null for an unknown program', () => {
    expect(createSqliteProgramRepository(db).remove(999)).toBeNull()
  })
})

// A carrera has no other correction path — there is no way to "move" its
// materias to a fixed copy — so the update has to touch the row in place and
// leave everything hanging off it alone.
describe('createSqliteProgramRepository — update', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('corrects the plain fields of an existing program', () => {
    const repository = createSqliteProgramRepository(db)
    const created = repository.create(abogacia)

    const updated = repository.update({
      id: created.id,
      name: 'Abogacía (UBA)',
      institution: 'UBA',
      color: '#A78BFA',
      gradingScheme: 'numerico',
      gradeScale: 10
    })

    expect(updated).toEqual({
      id: created.id,
      name: 'Abogacía (UBA)',
      institution: 'UBA',
      color: '#A78BFA',
      gradingScheme: 'numerico',
      gradeScale: 10
    })
  })

  it('clears the institution when it is blanked out', () => {
    const repository = createSqliteProgramRepository(db)
    const created = repository.create(abogacia)

    const updated = repository.update({ ...abogacia, id: created.id, institution: null })

    expect(updated?.institution).toBeNull()
  })

  // The scale and the scheme move together, and a program with nothing
  // recorded is allowed to change both (the "is it still safe?" rule lives in
  // the renderer's domain, not here — main ships facts).
  it('moves a program to pass/fail and drops its scale', () => {
    const repository = createSqliteProgramRepository(db)
    const created = repository.create(abogacia)

    const updated = repository.update({
      ...abogacia,
      id: created.id,
      gradingScheme: 'binario',
      gradeScale: null
    })

    expect(updated).toMatchObject({ gradingScheme: 'binario', gradeScale: null })
  })

  it('reports null for a program that does not exist', () => {
    const repository = createSqliteProgramRepository(db)

    expect(repository.update({ ...abogacia, id: 999 })).toBeNull()
  })

  // The whole point of editing in place rather than recreating: the periods
  // and the materias recorded under them must survive untouched.
  it('leaves the periods and their materias attached', () => {
    const repository = createSqliteProgramRepository(db)
    const created = repository.create(abogacia)
    const period = repository.createPeriod({
      programId: created.id,
      name: '1er Cuatrimestre 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-18'
    })
    db.insert(subjects).values({ name: 'Derecho', code: 'D-1', color: '#fff', periodId: period.id }).run()

    repository.update({ ...abogacia, id: created.id, name: 'Abogacía (UBA)' })

    const detail = repository.detail(created.id)
    expect(detail?.name).toBe('Abogacía (UBA)')
    expect(detail?.periods).toHaveLength(1)
    expect(detail?.subjectCount).toBe(1)
  })
})
