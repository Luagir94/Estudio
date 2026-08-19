import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { deadlines, finalExams, periods, programs } from '../../db/schema'
import { createSqliteSubjectRepository } from './sqliteSubjectRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

/**
 * Every test in this file goes through the PRODUCTION connection factory
 * (`openAppDatabase`) and the PRODUCTION migrator — not a hand-rolled raw
 * connection with its own ad hoc pragma/SQL exec. This closes the gap
 * flagged by gate-findings/slice-2a Finding 1: a test that creates its own
 * connection never actually proves the production `foreign_keys` pragma is
 * what makes `ON DELETE CASCADE` work.
 */
function createTestDb() {
  const { db, raw } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return { db, raw }
}

/**
 * A subject is always born inside a period (`createSubjectInputSchema`
 * requires one), so every test needs a program and a period to point at.
 */
function seedPeriod(
  db: ReturnType<typeof createTestDb>['db'],
  gradingScheme: 'numerico' | 'binario' = 'numerico',
  gradeScale: number | null = 10
): number {
  const program = db
    .insert(programs)
    .values({ name: `Programa ${gradingScheme}`, color: '#fff', gradingScheme, gradeScale })
    .returning()
    .get()
  return db
    .insert(periods)
    .values({
      programId: program.id,
      name: '1er 2026',
      kind: 'cuatrimestre',
      startsOn: '2026-03-09',
      endsOn: '2026-07-18'
    })
    .returning()
    .get().id
}

/**
 * Orphans an existing subject the ONLY way the app can produce one: by
 * deleting its program, whose period cascade sets `period_id` to NULL. There
 * is deliberately no command that creates a subject without a period.
 */
function orphan(db: ReturnType<typeof createTestDb>['db']): void {
  db.delete(programs).run()
}

describe('createSqliteSubjectRepository', () => {
  let db: ReturnType<typeof createTestDb>['db']
  let raw: ReturnType<typeof createTestDb>['raw']
  let periodId: number

  beforeEach(() => {
    ;({ db, raw } = createTestDb())
    periodId = seedPeriod(db)
  })

  it('persists the subject and all of its slots in one transaction', () => {
    const repository = createSqliteSubjectRepository(db)

    const created = repository.create({
      name: 'Algoritmos',
      code: 'ALG-101',
      color: '#7c3aed',
      docente: null,
      contacto: null,
      periodId,
      slots: [
        { dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: 'Aula 4' },
        { dayOfWeek: 3, startMinutes: 600, endMinutes: 660, location: 'Aula 4' }
      ]
    })

    expect(created.slots).toHaveLength(2)
    expect(repository.list()).toHaveLength(1)
    expect(repository.list()[0]?.slots).toHaveLength(2)
  })

  it('rolls back both the subject and its slots when one slot is invalid (end before start)', () => {
    const repository = createSqliteSubjectRepository(db)

    expect(() =>
      repository.create({
        name: 'Bases de Datos',
        code: 'BD-201',
        color: '#22c55e',
        docente: null,
        contacto: null,
        periodId,
        slots: [
          { dayOfWeek: 2, startMinutes: 600, endMinutes: 660, location: null },
          { dayOfWeek: 4, startMinutes: 700, endMinutes: 650, location: null }
        ]
      })
    ).toThrow(/endMinutes/)

    expect(repository.list()).toHaveLength(0)
  })

  describe('detail', () => {
    it('aggregates the subject, its slots, and its deadlines', () => {
      const repository = createSqliteSubjectRepository(db)
      const created = repository.create({
        name: 'Algoritmos',
        code: 'ALG-101',
        color: '#7c3aed',
        docente: null,
        contacto: null,
        periodId,
        slots: [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: 'Aula 4' }]
      })
      db.insert(deadlines)
        .values([
          { subjectId: created.id, title: 'TP1', type: 'tp', dueAt: '2026-04-01T23:59', done: false },
          { subjectId: created.id, title: 'TP2', type: 'tp', dueAt: '2026-04-08T23:59', done: true }
        ])
        .run()

      const detail = repository.detail(created.id)

      expect(detail?.slots).toHaveLength(1)
      expect(detail?.deadlines).toHaveLength(2)
      expect(detail?.deadlines.map((deadline) => deadline.done).sort()).toEqual([false, true])
    })

    it('returns null for a subject id that does not exist', () => {
      const repository = createSqliteSubjectRepository(db)

      expect(repository.detail(999)).toBeNull()
    })
  })

  describe('updateSchedule', () => {
    it('atomically replaces the subject fields and the whole slot set', () => {
      const repository = createSqliteSubjectRepository(db)
      const created = repository.create({
        name: 'Algoritmos',
        code: 'ALG-101',
        color: '#7c3aed',
        docente: null,
        contacto: null,
        periodId,
        slots: [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: 'Aula 4' }]
      })

      const updated = repository.updateSchedule({
        id: created.id,
        name: 'Algoritmos I',
        code: 'ALG-101',
        color: '#7c3aed',
        docente: 'Dra. Pérez',
        contacto: null,
        campusUrl: 'https://campus.uni.edu/course/1',
        notas: 'Trae calculadora',
        attendanceMinPercent: 75,
        slots: [
          { dayOfWeek: 2, startMinutes: 480, endMinutes: 540, location: 'Aula 1' },
          { dayOfWeek: 4, startMinutes: 480, endMinutes: 540, location: 'Aula 1' }
        ]
      })

      expect(updated.name).toBe('Algoritmos I')
      expect(updated.docente).toBe('Dra. Pérez')
      expect(updated.campusUrl).toBe('https://campus.uni.edu/course/1')
      expect(updated.slots).toHaveLength(2)
      expect(updated.slots.map((slot) => slot.dayOfWeek).sort()).toEqual([2, 4])

      const detail = repository.detail(created.id)
      expect(detail?.slots).toHaveLength(2) // old slot was replaced, not appended to
    })

    it('rolls back the whole update when a replacement slot is invalid', () => {
      const repository = createSqliteSubjectRepository(db)
      const created = repository.create({
        name: 'Algoritmos',
        code: 'ALG-101',
        color: '#7c3aed',
        docente: null,
        contacto: null,
        periodId,
        slots: [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: 'Aula 4' }]
      })

      expect(() =>
        repository.updateSchedule({
          id: created.id,
          name: 'Algoritmos I',
          code: 'ALG-101',
          color: '#7c3aed',
          docente: null,
          contacto: null,
          campusUrl: null,
          notas: null,
          attendanceMinPercent: null,
          slots: [{ dayOfWeek: 2, startMinutes: 700, endMinutes: 650, location: null }]
        })
      ).toThrow(/endMinutes/)

      const detail = repository.detail(created.id)
      expect(detail?.name).toBe('Algoritmos') // unchanged
      expect(detail?.slots).toHaveLength(1) // original slot untouched
    })
  })

  describe('remove (cascade delete — gate-findings/slice-2a Finding 1)', () => {
    it('deletes the subject, and the FK cascade removes its slots and deadlines in the same operation', () => {
      const repository = createSqliteSubjectRepository(db)
      const created = repository.create({
        name: 'Algoritmos',
        code: 'ALG-101',
        color: '#7c3aed',
        docente: null,
        contacto: null,
        periodId,
        slots: [
          { dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: 'Aula 4' },
          { dayOfWeek: 3, startMinutes: 600, endMinutes: 660, location: 'Aula 4' },
          { dayOfWeek: 5, startMinutes: 600, endMinutes: 660, location: 'Aula 4' }
        ]
      })
      db.insert(deadlines)
        .values(
          Array.from({ length: 7 }, (_, index) => ({
            subjectId: created.id,
            title: `Entrega ${index + 1}`,
            type: 'tp',
            dueAt: '2026-04-01T23:59',
            done: false
          }))
        )
        .run()

      const result = repository.remove(created.id)

      expect(result).toEqual({ deletedSlots: 3, deletedDeadlines: 7 })
      expect(repository.list()).toHaveLength(0)
      expect(repository.detail(created.id)).toBeNull()
      // Prove the CASCADE actually ran (not just that the subject row is
      // gone) by querying the child tables directly on the same production
      // connection — this is the exact behavior that silently breaks if
      // `PRAGMA foreign_keys = ON` regresses in connection.ts.
      const remainingSlots = raw.prepare('SELECT COUNT(*) as count FROM schedule_slots').get() as {
        count: number
      }
      const remainingDeadlines = raw.prepare('SELECT COUNT(*) as count FROM deadlines').get() as {
        count: number
      }
      expect(remainingSlots.count).toBe(0)
      expect(remainingDeadlines.count).toBe(0)
    })

    it('returns null and deletes nothing for a subject id that does not exist', () => {
      const repository = createSqliteSubjectRepository(db)

      expect(repository.remove(999)).toBeNull()
    })

    it('reports zero deleted deadlines (never a misleading omission) for a subject with none', () => {
      const repository = createSqliteSubjectRepository(db)
      const created = repository.create({
        name: 'Sin entregas',
        code: 'SE-001',
        color: '#000000',
        docente: null,
        contacto: null,
        periodId,
        slots: [{ dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: null }]
      })

      const result = repository.remove(created.id)

      expect(result).toEqual({ deletedSlots: 1, deletedDeadlines: 0 })
    })
  })
})

describe('createSqliteSubjectRepository — period, outcome and grade', () => {
  let db: ReturnType<typeof createTestDb>['db']
  let repository: ReturnType<typeof createSqliteSubjectRepository>
  let numericPeriodId: number
  let binaryPeriodId: number

  function seedProgram(scheme: 'numerico' | 'binario', scale: number | null): number {
    const program = db
      .insert(programs)
      .values({ name: `P-${scheme}`, color: '#fff', gradingScheme: scheme, gradeScale: scale })
      .returning()
      .get()
    return db
      .insert(periods)
      .values({
        programId: program.id,
        name: '1er 2026',
        kind: 'cuatrimestre',
        startsOn: '2026-03-09',
        endsOn: '2026-07-18'
      })
      .returning()
      .get().id
  }

  function createSubject(periodId: number) {
    return repository.create({
      name: 'Teoría del Estado',
      code: 'TE-103',
      color: '#fff',
      docente: null,
      contacto: null,
      periodId,
      slots: [{ dayOfWeek: 1, startMinutes: 480, endMinutes: 570, location: null }]
    })
  }

  beforeEach(() => {
    db = createTestDb().db
    repository = createSqliteSubjectRepository(db)
    numericPeriodId = seedProgram('numerico', 10)
    binaryPeriodId = seedProgram('binario', null)
  })

  it('create stores the period the subject was placed in', () => {
    expect(createSubject(numericPeriodId).periodId).toBe(numericPeriodId)
  })

  it('list carries the period and program the status and grading depend on', () => {
    createSubject(numericPeriodId)

    const [listed] = repository.list()

    expect(listed.period).toMatchObject({ id: numericPeriodId, startsOn: '2026-03-09', endsOn: '2026-07-18' })
    expect(listed.program).toMatchObject({ gradingScheme: 'numerico', gradeScale: 10 })
    expect(listed.finals).toEqual([])
  })

  // An orphan can only be produced by deleting the program — a subject can
  // never be CREATED without a period.
  it('list reports an orphaned subject as having neither period nor program', () => {
    createSubject(numericPeriodId)
    orphan(db)

    const [listed] = repository.list()

    expect(listed.period).toBeNull()
    expect(listed.program).toBeNull()
  })

  it('list carries the final-exam results without deciding the status', () => {
    const subject = createSubject(numericPeriodId)
    db.insert(finalExams).values({ subjectId: subject.id, label: '1ra', result: 'reprobado' }).run()
    db.insert(finalExams).values({ subjectId: subject.id, label: '2da', result: 'pendiente' }).run()

    expect(repository.list()[0].finals).toEqual([{ result: 'reprobado' }, { result: 'pendiente' }])
  })

  it('setOutcome records the decision and its grade', () => {
    const subject = createSubject(numericPeriodId)

    const updated = repository.setOutcome({ id: subject.id, outcome: 'aprobada', grade: 8 })

    expect(updated).toMatchObject({ outcome: 'aprobada', grade: 8 })
  })

  it('setOutcome accepts a decision with no grade', () => {
    const subject = createSubject(numericPeriodId)

    expect(repository.setOutcome({ id: subject.id, outcome: 'finalPendiente', grade: null })).toMatchObject({
      outcome: 'finalPendiente',
      grade: null
    })
  })

  // The rule lives in shared/domain/grading.ts — main enforces the same one
  // the form applies, so a hand-crafted payload cannot get past it.
  it('setOutcome refuses a grade above the program scale', () => {
    const subject = createSubject(numericPeriodId)

    expect(() => repository.setOutcome({ id: subject.id, outcome: 'aprobada', grade: 11 })).toThrow(
      'grade must be between 0 and 10'
    )
  })

  it('setOutcome refuses any grade under a pass/fail program', () => {
    const subject = createSubject(binaryPeriodId)

    expect(() => repository.setOutcome({ id: subject.id, outcome: 'aprobada', grade: 8 })).toThrow(
      'a pass/fail program does not carry grades'
    )
  })

  it('setOutcome refuses a grade on a subject orphaned by a deleted program', () => {
    const subject = createSubject(numericPeriodId)
    orphan(db)

    expect(() => repository.setOutcome({ id: subject.id, outcome: 'aprobada', grade: 8 })).toThrow(
      'Cannot grade a subject that does not belong to a program'
    )
  })

  // Losing its program must not lock the subject: you can still say how it
  // went, you just cannot attach a grade to a scale that no longer exists.
  it('setOutcome still closes an orphaned subject when no grade is given', () => {
    const subject = createSubject(numericPeriodId)
    orphan(db)

    expect(repository.setOutcome({ id: subject.id, outcome: 'aprobada', grade: null })).toMatchObject({
      outcome: 'aprobada'
    })
  })

  it('setOutcome returns null for an unknown subject', () => {
    expect(repository.setOutcome({ id: 999, outcome: 'aprobada', grade: null })).toBeNull()
  })
})

describe('createSqliteSubjectRepository — pending deadline counts', () => {
  let db: ReturnType<typeof createTestDb>['db']
  let repository: ReturnType<typeof createSqliteSubjectRepository>
  let subjectId: number
  let periodId: number

  beforeEach(() => {
    db = createTestDb().db
    periodId = seedPeriod(db)
    repository = createSqliteSubjectRepository(db)
    subjectId = repository.create({
      name: 'Derecho Constitucional',
      code: 'DC-201',
      color: '#fff',
      docente: null,
      contacto: null,
      periodId,
      slots: [{ dayOfWeek: 1, startMinutes: 480, endMinutes: 570, location: null }]
    }).id
  })

  it('counts only the deadlines that are still open', () => {
    db.insert(deadlines).values({ subjectId, title: 'TP1', type: 'tp', dueAt: '2026-04-01T23:59', done: false }).run()
    db.insert(deadlines).values({ subjectId, title: 'TP2', type: 'tp', dueAt: '2026-04-08T23:59', done: true }).run()

    expect(repository.list()[0].pendingDeadlines).toBe(1)
  })

  it('reports zero when nothing is open', () => {
    expect(repository.list()[0].pendingDeadlines).toBe(0)
  })

  it('never counts another subject deadlines', () => {
    const other = repository.create({
      name: 'Otra',
      code: 'O-1',
      color: '#fff',
      docente: null,
      contacto: null,
      periodId,
      slots: [{ dayOfWeek: 2, startMinutes: 480, endMinutes: 570, location: null }]
    })
    db.insert(deadlines)
      .values({ subjectId: other.id, title: 'ajena', type: 'tp', dueAt: '2026-04-01T23:59', done: false })
      .run()

    expect(repository.list().find((subject) => subject.id === subjectId)?.pendingDeadlines).toBe(0)
  })
})
