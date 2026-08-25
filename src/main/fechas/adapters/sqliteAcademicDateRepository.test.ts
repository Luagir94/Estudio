import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { programs } from '../../db/schema'
import { createSqliteAcademicDateRepository } from './sqliteAcademicDateRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

// Goes through the PRODUCTION connection factory and migrator, so the
// `foreign_keys` pragma that makes ON DELETE CASCADE work is the real one
// (same precedent as sqliteProgramRepository.test.ts).
function createTestDb() {
  const { db } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

function insertProgram(db: ReturnType<typeof createTestDb>, name: string): number {
  return db
    .insert(programs)
    .values({ name, institution: null, color: '#4C8DFF', gradingScheme: 'binario', gradeScale: null })
    .returning()
    .get().id
}

describe('createSqliteAcademicDateRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let programId: number

  beforeEach(() => {
    db = createTestDb()
    programId = insertProgram(db, 'Abogacía')
  })

  it('round-trips a window', () => {
    const repository = createSqliteAcademicDateRepository(db)

    const created = repository.create({
      programId,
      title: 'Inscripción a finales — Diciembre',
      kind: 'inscripcionFinales',
      startsOn: '2026-12-01',
      endsOn: '2026-12-05'
    })

    expect(created).toMatchObject({
      programId,
      title: 'Inscripción a finales — Diciembre',
      kind: 'inscripcionFinales',
      startsOn: '2026-12-01',
      endsOn: '2026-12-05'
    })
    expect(repository.list()).toEqual([{ ...created, programName: 'Abogacía' }])
  })

  it('stores a single-day date as a null end', () => {
    const repository = createSqliteAcademicDateRepository(db)

    const created = repository.create({
      programId,
      title: 'Vencimiento de regularidad',
      kind: 'vencimientoRegularidad',
      startsOn: '2026-12-20',
      endsOn: null
    })

    expect(created.endsOn).toBeNull()
  })

  it('list joins the program name and orders chronologically by start date', () => {
    const repository = createSqliteAcademicDateRepository(db)
    const otherProgram = insertProgram(db, 'Ingeniería en Sistemas')
    repository.create({
      programId,
      title: 'Febrero',
      kind: 'inscripcionCursadas',
      startsOn: '2027-02-10',
      endsOn: null
    })
    repository.create({
      programId: otherProgram,
      title: 'Diciembre',
      kind: 'inscripcionFinales',
      startsOn: '2026-12-01',
      endsOn: '2026-12-05'
    })

    expect(repository.list().map((date) => [date.title, date.programName])).toEqual([
      ['Diciembre', 'Ingeniería en Sistemas'],
      ['Febrero', 'Abogacía']
    ])
  })

  it('listByProgram returns only that carrera dates', () => {
    const repository = createSqliteAcademicDateRepository(db)
    const otherProgram = insertProgram(db, 'Ingeniería en Sistemas')
    repository.create({ programId, title: 'Propia', kind: 'otro', startsOn: '2026-12-01', endsOn: null })
    repository.create({ programId: otherProgram, title: 'Ajena', kind: 'otro', startsOn: '2026-12-02', endsOn: null })

    expect(repository.listByProgram(programId).map((date) => date.title)).toEqual(['Propia'])
  })

  it('update corrects the fields and keeps the row on its own carrera', () => {
    const repository = createSqliteAcademicDateRepository(db)
    const created = repository.create({
      programId,
      title: 'Inscripción',
      kind: 'inscripcionFinales',
      startsOn: '2026-12-01',
      endsOn: '2026-12-05'
    })

    const updated = repository.update({
      id: created.id,
      title: 'Inscripción a finales — Diciembre',
      kind: 'inscripcionCursadas',
      startsOn: '2026-12-02',
      endsOn: null
    })

    expect(updated).toMatchObject({
      id: created.id,
      programId,
      title: 'Inscripción a finales — Diciembre',
      kind: 'inscripcionCursadas',
      startsOn: '2026-12-02',
      endsOn: null
    })
  })

  it('update reports no match rather than inventing a row', () => {
    const repository = createSqliteAcademicDateRepository(db)

    expect(repository.update({ id: 9999, title: 'X', kind: 'otro', startsOn: '2026-12-01', endsOn: null })).toBeNull()
  })

  it('remove deletes the row and reports whether there was one', () => {
    const repository = createSqliteAcademicDateRepository(db)
    const created = repository.create({ programId, title: 'X', kind: 'otro', startsOn: '2026-12-01', endsOn: null })

    expect(repository.remove(created.id)).toBe(true)
    expect(repository.list()).toEqual([])
    expect(repository.remove(created.id)).toBe(false)
  })

  // The FK is the whole storage contract for ownership: a carrera's dates are
  // its own, and deleting it must not leave orphan trámites behind.
  it('cascade-deletes every date of a deleted program', () => {
    const repository = createSqliteAcademicDateRepository(db)
    const survivor = insertProgram(db, 'Ingeniería en Sistemas')
    repository.create({ programId, title: 'Se va', kind: 'otro', startsOn: '2026-12-01', endsOn: null })
    repository.create({ programId: survivor, title: 'Queda', kind: 'otro', startsOn: '2026-12-02', endsOn: null })

    db.delete(programs).where(eq(programs.id, programId)).run()

    expect(repository.list().map((date) => date.title)).toEqual(['Queda'])
  })
})
