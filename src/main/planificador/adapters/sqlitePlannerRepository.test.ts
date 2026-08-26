import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { finalExams, periods, plannerEntries, programs, subjectPrerequisites, subjects } from '../../db/schema'
import { createSqlitePlannerRepository } from './sqlitePlannerRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

function createTestDb() {
  const { db } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

describe('createSqlitePlannerRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repository: ReturnType<typeof createSqlitePlannerRepository>
  let algebra: number
  let analisis: number
  let estructuras: number
  let periodId: number

  function insertSubject(name: string, code: string): number {
    return db.insert(subjects).values({ name, code, color: '#fff' }).returning().get().id
  }

  beforeEach(() => {
    db = createTestDb()
    repository = createSqlitePlannerRepository(db)
    algebra = insertSubject('Álgebra I', 'MAT-101')
    analisis = insertSubject('Análisis Matemático I', 'MAT-102')
    estructuras = insertSubject('Estructuras de Datos', 'INF-202')
    const programId = db
      .insert(programs)
      .values({ name: 'Ingeniería', color: '#fff', gradingScheme: 'numerico', gradeScale: 10 })
      .returning()
      .get().id
    periodId = db
      .insert(periods)
      .values({ programId, name: '1er Cuatrimestre 2027', kind: 'cuatrimestre', startsOn: '2027-03-01' })
      .returning()
      .get().id
  })

  describe('prerequisites', () => {
    it('stores an edge and returns it with the required subject it names', () => {
      const created = repository.addPrerequisite({
        subjectId: estructuras,
        requiresSubjectId: algebra,
        requiredLevel: 'aprobada'
      })

      expect(created).toMatchObject({
        subjectId: estructuras,
        requiredLevel: 'aprobada',
        requires: { id: algebra, name: 'Álgebra I', outcome: null, regularity: null, finals: [] }
      })
    })

    // Facts, never a verdict: the finals rows travel so the renderer's domain
    // can resolve `aprobada` through `resolveFinalsVerdict`.
    it('carries the required subject final-exam results', () => {
      db.insert(finalExams).values({ subjectId: algebra, label: '1ra mesa', result: 'aprobado' }).run()

      const created = repository.addPrerequisite({
        subjectId: estructuras,
        requiresSubjectId: algebra,
        requiredLevel: 'aprobada'
      })

      expect(created.requires.finals).toEqual([{ result: 'aprobado' }])
    })

    // The UNIQUE index says one edge per pair, at one level. A second write is
    // therefore a CORRECTION of the level, never a second row.
    it('rewrites the level instead of duplicating the pair', () => {
      const first = repository.addPrerequisite({
        subjectId: estructuras,
        requiresSubjectId: algebra,
        requiredLevel: 'regularizada'
      })
      const second = repository.addPrerequisite({
        subjectId: estructuras,
        requiresSubjectId: algebra,
        requiredLevel: 'aprobada'
      })

      expect(second.id).toBe(first.id)
      expect(second.requiredLevel).toBe('aprobada')
      expect(repository.listPrerequisitesBySubject(estructuras)).toHaveLength(1)
    })

    it('keeps edges to different subjects apart', () => {
      repository.addPrerequisite({ subjectId: estructuras, requiresSubjectId: algebra, requiredLevel: 'aprobada' })
      repository.addPrerequisite({
        subjectId: estructuras,
        requiresSubjectId: analisis,
        requiredLevel: 'regularizada'
      })

      expect(repository.listPrerequisitesBySubject(estructuras)).toHaveLength(2)
    })

    it('changes only the level on update', () => {
      const created = repository.addPrerequisite({
        subjectId: estructuras,
        requiresSubjectId: algebra,
        requiredLevel: 'aprobada'
      })

      const updated = repository.updatePrerequisite({ id: created.id, requiredLevel: 'regularizada' })

      expect(updated).toMatchObject({ id: created.id, requiredLevel: 'regularizada', requires: { id: algebra } })
    })

    it('reports a missing row on update instead of inventing one', () => {
      expect(repository.updatePrerequisite({ id: 9999, requiredLevel: 'aprobada' })).toBeNull()
    })

    it('removes an edge and reports whether there was one', () => {
      const created = repository.addPrerequisite({
        subjectId: estructuras,
        requiresSubjectId: algebra,
        requiredLevel: 'aprobada'
      })

      expect(repository.removePrerequisite(created.id)).toBe(true)
      expect(repository.removePrerequisite(created.id)).toBe(false)
      expect(repository.listPrerequisitesBySubject(estructuras)).toEqual([])
    })

    it('lists every edge in the database for the cycle guard', () => {
      repository.addPrerequisite({ subjectId: estructuras, requiresSubjectId: analisis, requiredLevel: 'aprobada' })
      repository.addPrerequisite({ subjectId: analisis, requiresSubjectId: algebra, requiredLevel: 'aprobada' })

      // Order is not asserted on purpose: an edge SET has none, and the graph
      // rule that consumes this does not read one.
      const edges = repository.listPrerequisiteEdges()

      expect(edges).toHaveLength(2)
      expect(edges).toContainEqual({ subjectId: estructuras, requiresSubjectId: analisis })
      expect(edges).toContainEqual({ subjectId: analisis, requiresSubjectId: algebra })
    })

    // BOTH ends cascade. Deleting the materia that HAS the requirement takes
    // its rules with it...
    it('cascades when the requiring subject is deleted', () => {
      repository.addPrerequisite({ subjectId: estructuras, requiresSubjectId: algebra, requiredLevel: 'aprobada' })

      db.delete(subjects).where(eq(subjects.id, estructuras)).run()

      expect(db.select().from(subjectPrerequisites).all()).toEqual([])
    })

    // ...and deleting the materia that IS the requirement takes with it every
    // rule that named it, because a rule pointing at a row that no longer
    // exists is a dangling reference the planner would have to guess about.
    it('cascades when the required subject is deleted', () => {
      repository.addPrerequisite({ subjectId: estructuras, requiresSubjectId: algebra, requiredLevel: 'aprobada' })

      db.delete(subjects).where(eq(subjects.id, algebra)).run()

      expect(db.select().from(subjectPrerequisites).all()).toEqual([])
    })
  })

  describe('draft entries', () => {
    it('stores a draft line for a período and a materia', () => {
      const entry = repository.addEntry({ periodId, subjectId: algebra })

      expect(entry).toMatchObject({ periodId, subjectId: algebra })
    })

    // "In the draft" is not a counter. Asking twice is the same request, and
    // the caller gets the same row rather than an error about a state it
    // already has.
    it('is idempotent on the same pair', () => {
      const first = repository.addEntry({ periodId, subjectId: algebra })
      const second = repository.addEntry({ periodId, subjectId: algebra })

      expect(second.id).toBe(first.id)
      expect(repository.listEntries()).toHaveLength(1)
    })

    it('keeps one line per período and materia', () => {
      const otherPeriod = db
        .insert(periods)
        .values({
          programId: db.select().from(programs).all()[0]!.id,
          name: '2do Cuatrimestre 2027',
          kind: 'cuatrimestre',
          startsOn: '2027-08-01'
        })
        .returning()
        .get().id

      repository.addEntry({ periodId, subjectId: algebra })
      repository.addEntry({ periodId, subjectId: analisis })
      repository.addEntry({ periodId: otherPeriod, subjectId: algebra })

      expect(repository.listEntries()).toHaveLength(3)
    })

    it('removes a line and reports whether there was one', () => {
      repository.addEntry({ periodId, subjectId: algebra })

      expect(repository.removeEntry({ periodId, subjectId: algebra })).toBe(true)
      expect(repository.removeEntry({ periodId, subjectId: algebra })).toBe(false)
      expect(repository.listEntries()).toEqual([])
    })

    // The draft is ABOUT the período and means nothing without it.
    it('cascades when the período is deleted', () => {
      repository.addEntry({ periodId, subjectId: algebra })

      db.delete(periods).where(eq(periods.id, periodId)).run()

      expect(db.select().from(plannerEntries).all()).toEqual([])
    })

    it('cascades when the materia is deleted', () => {
      repository.addEntry({ periodId, subjectId: algebra })

      db.delete(subjects).where(eq(subjects.id, algebra)).run()

      expect(db.select().from(plannerEntries).all()).toEqual([])
    })

    // Nothing in this feature writes `subjects.period_id` — drafting is not
    // enrolling, and there is no "confirmar" command to blur the two.
    it('never touches the subject it drafts', () => {
      repository.addEntry({ periodId, subjectId: algebra })

      expect(db.select().from(subjects).where(eq(subjects.id, algebra)).get()?.periodId).toBeNull()
    })
  })
})
