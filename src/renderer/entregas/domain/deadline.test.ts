import { beforeAll, describe, expect, it } from 'vitest'
import { classifyDeadline, createDeadline, daysRemaining, formatDeadlineStatus, groupDeadlines } from './deadline'

// Deadline classification exercises real wall-clock local-time arithmetic
// (design §3a "the DST rule" / spec "Days-Remaining Calendar-Day
// Computation"), so pin the process timezone deterministically instead of
// depending on whatever zone the CI/dev machine happens to be in — same
// precedent as materias/domain/subjectDetail.test.ts.
beforeAll(() => {
  process.env.TZ = 'America/New_York'
})

describe('createDeadline validation (spec: "Deadline Fields and Lifecycle")', () => {
  it('rejects a payload missing título, materia, tipo, and fecha límite', () => {
    const result = createDeadline({})

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected validation failure')
    const paths = result.errors.map((issue) => issue.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['title', 'subjectId', 'type', 'dueAt']))
  })

  it('accepts a payload with every required field and defaults done to false', () => {
    const result = createDeadline({
      title: 'TP 2 — Scheduler',
      subjectId: 1,
      type: 'Trabajo práctico',
      dueAt: '2027-08-18T23:59'
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected validation success')
    expect(result.deadline.done).toBe(false)
  })

  it('rejects a fecha límite that is not a local naive datetime (no offset allowed)', () => {
    const result = createDeadline({
      title: 'TP 2',
      subjectId: 1,
      type: 'Trabajo práctico',
      dueAt: '2027-08-18T23:59:00Z'
    })

    expect(result.ok).toBe(false)
  })
})

describe('daysRemaining (spec: "Days-Remaining Calendar-Day Computation")', () => {
  it('due 23:59 today at now=23:50 today classifies as due today (0 days), not overdue', () => {
    const now = new Date(2027, 7, 18, 23, 50)
    const dueAt = '2027-08-18T23:59'

    expect(daysRemaining(dueAt, now)).toBe(0)
  })

  it('due tomorrow 00:05 at now=23:58 today reports 1 day remaining, not 0 hours', () => {
    const now = new Date(2027, 7, 18, 23, 58)
    const dueAt = '2027-08-19T00:05'

    expect(daysRemaining(dueAt, now)).toBe(1)
  })
})

describe('classifyDeadline', () => {
  const now = new Date(2027, 7, 18, 12, 0)

  it('a done deadline is always COMPLETADAS, even if its due date is in the past', () => {
    expect(classifyDeadline('2020-01-01T00:00', true, now)).toBe('completadas')
  })

  it('a pending deadline with a past due date is ATRASADAS', () => {
    expect(classifyDeadline('2027-08-16T10:00', false, now)).toBe('atrasadas')
  })

  it('a pending deadline due today (0 days) is PROXIMOS_7_DIAS, not ATRASADAS', () => {
    expect(classifyDeadline('2027-08-18T23:59', false, now)).toBe('proximos7')
  })

  it('a pending deadline due exactly 7 days out is still PROXIMOS_7_DIAS', () => {
    expect(classifyDeadline('2027-08-25T12:00', false, now)).toBe('proximos7')
  })

  it('a pending deadline due more than 7 days out is MAS_ADELANTE', () => {
    expect(classifyDeadline('2027-08-26T12:00', false, now)).toBe('masAdelante')
  })
})

describe('formatDeadlineStatus (matches design node AHToB status pill copy exactly)', () => {
  const now = new Date(2027, 7, 18, 12, 0)

  it('formats a completed deadline as "Completada"', () => {
    expect(formatDeadlineStatus('2020-01-01T00:00', true, now)).toBe('Completada')
  })

  it('formats an overdue deadline as "N días de atraso"', () => {
    expect(formatDeadlineStatus('2027-08-16T10:00', false, now)).toBe('2 días de atraso')
  })

  it('formats a 1-day overdue deadline in the singular ("1 día de atraso")', () => {
    expect(formatDeadlineStatus('2027-08-17T10:00', false, now)).toBe('1 día de atraso')
  })

  it('formats a due-today deadline as "Hoy"', () => {
    expect(formatDeadlineStatus('2027-08-18T23:59', false, now)).toBe('Hoy')
  })

  it('formats a due-tomorrow deadline as "Mañana"', () => {
    expect(formatDeadlineStatus('2027-08-19T09:00', false, now)).toBe('Mañana')
  })

  it('formats a deadline 4 days out as "En 4 días" (design row: TP 2 — Scheduler)', () => {
    expect(formatDeadlineStatus('2027-08-22T12:00', false, now)).toBe('En 4 días')
  })

  it('formats a deadline 14 days out as "En 2 semanas" (design row: TP 3 — Sistemas de archivos)', () => {
    expect(formatDeadlineStatus('2027-09-01T12:00', false, now)).toBe('En 2 semanas')
  })
})

describe('groupDeadlines', () => {
  const now = new Date(2027, 7, 18, 12, 0)

  it('buckets every deadline into exactly one group — no deadline is ever dropped', () => {
    const deadlines = [
      { id: 1, dueAt: '2027-08-16T10:00', done: false }, // atrasadas
      { id: 2, dueAt: '2027-08-20T10:00', done: false }, // proximos7
      { id: 3, dueAt: '2027-09-01T10:00', done: false }, // masAdelante
      { id: 4, dueAt: '2020-01-01T10:00', done: true } // completadas (overdue date but done)
    ]

    const groups = groupDeadlines(deadlines, now)

    expect(groups.atrasadas.map((d) => d.id)).toEqual([1])
    expect(groups.proximos7.map((d) => d.id)).toEqual([2])
    expect(groups.masAdelante.map((d) => d.id)).toEqual([3])
    expect(groups.completadas.map((d) => d.id)).toEqual([4])
  })

  it('sorts each group by fecha límite ascending', () => {
    const deadlines = [
      { id: 1, dueAt: '2027-08-25T10:00', done: false },
      { id: 2, dueAt: '2027-08-19T10:00', done: false }
    ]

    const groups = groupDeadlines(deadlines, now)

    expect(groups.proximos7.map((d) => d.id)).toEqual([2, 1])
  })
})
