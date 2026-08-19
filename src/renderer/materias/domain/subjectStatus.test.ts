import { describe, expect, it } from 'vitest'
import {
  countFinalsByResult,
  isPassed,
  matchesStatusFilter,
  resolveFinalsVerdict,
  resolveSubjectStatus,
  type SubjectOutcome
} from './subjectStatus'

// The period ran 09 mar – 18 jul 2026, so "today" sits comfortably after it.
const finishedPeriod = { startsOn: '2026-03-09', endsOn: '2026-07-18' }
const activePeriod = { startsOn: '2026-08-12', endsOn: '2026-12-04' }
const today = new Date(2026, 7, 15)

describe('resolveSubjectStatus', () => {
  it('is cursando while the period is still running and nothing was decided', () => {
    const status = resolveSubjectStatus({ outcome: null, period: activePeriod, finals: [] }, today)

    expect(status).toBe('cursando')
  })

  it('is sinCerrar once the period ended and nothing was decided', () => {
    const status = resolveSubjectStatus({ outcome: null, period: finishedPeriod, finals: [] }, today)

    expect(status).toBe('sinCerrar')
  })

  it('never asks to close a subject whose period has no end', () => {
    const status = resolveSubjectStatus(
      { outcome: null, period: { startsOn: '2024-03-04', endsOn: null }, finals: [] },
      today
    )

    expect(status).toBe('cursando')
  })

  it('is aprobada when closed as aprobada even before the period ends', () => {
    const status = resolveSubjectStatus({ outcome: 'aprobada', period: activePeriod, finals: [] }, today)

    expect(status).toBe('aprobada')
  })

  it('is reprobada when closed as reprobada', () => {
    const status = resolveSubjectStatus({ outcome: 'reprobada', period: finishedPeriod, finals: [] }, today)

    expect(status).toBe('reprobada')
  })

  it('is standby when the final is pending and no instance was recorded yet', () => {
    const status = resolveSubjectStatus({ outcome: 'finalPendiente', period: finishedPeriod, finals: [] }, today)

    expect(status).toBe('standby')
  })

  it('stays in standby while any instance is still pending', () => {
    const status = resolveSubjectStatus(
      {
        outcome: 'finalPendiente',
        period: finishedPeriod,
        finals: [{ result: 'reprobado' }, { result: 'pendiente' }]
      },
      today
    )

    expect(status).toBe('standby')
  })

  it('becomes aprobada as soon as one instance is passed', () => {
    const status = resolveSubjectStatus(
      {
        outcome: 'finalPendiente',
        period: finishedPeriod,
        finals: [{ result: 'reprobado' }, { result: 'aprobado' }, { result: 'pendiente' }]
      },
      today
    )

    expect(status).toBe('aprobada')
  })

  it('stays in standby when every instance was failed — the app never closes it', () => {
    const status = resolveSubjectStatus(
      {
        outcome: 'finalPendiente',
        period: finishedPeriod,
        finals: [{ result: 'reprobado' }, { result: 'reprobado' }]
      },
      today
    )

    expect(status).toBe('standby')
  })

  it('is reprobada only once the student closes it by hand', () => {
    const status = resolveSubjectStatus(
      {
        outcome: 'reprobada',
        period: finishedPeriod,
        finals: [{ result: 'reprobado' }, { result: 'reprobado' }]
      },
      today
    )

    expect(status).toBe('reprobada')
  })

  it('keeps standby when a new instance is added after failing them all', () => {
    const status = resolveSubjectStatus(
      {
        outcome: 'finalPendiente',
        period: finishedPeriod,
        finals: [{ result: 'reprobado' }, { result: 'reprobado' }, { result: 'pendiente' }]
      },
      today
    )

    expect(status).toBe('standby')
  })
})

describe('resolveFinalsVerdict', () => {
  it('reads an empty instance list as sinInstancias', () => {
    expect(resolveFinalsVerdict([])).toBe('sinInstancias')
  })

  it('reports esperandoMesa while any instance is still open', () => {
    expect(resolveFinalsVerdict([{ result: 'reprobado' }, { result: 'pendiente' }])).toBe('esperandoMesa')
  })

  it('reports todasReprobadas so the screen can ask for a decision', () => {
    expect(resolveFinalsVerdict([{ result: 'reprobado' }, { result: 'reprobado' }])).toBe('todasReprobadas')
  })

  it('prefers a single pass over any number of failures', () => {
    expect(resolveFinalsVerdict([{ result: 'reprobado' }, { result: 'reprobado' }, { result: 'aprobado' }])).toBe(
      'aprobado'
    )
  })
})

describe('countFinalsByResult', () => {
  it('counts every result bucket, including the empty ones', () => {
    const counts = countFinalsByResult([{ result: 'reprobado' }, { result: 'pendiente' }, { result: 'pendiente' }])

    expect(counts).toEqual({ pendiente: 2, aprobado: 0, reprobado: 1 })
  })
})

describe('isPassed', () => {
  it('passes a subject closed as aprobada', () => {
    expect(isPassed({ outcome: 'aprobada', hasApprovedFinal: false })).toBe(true)
  })

  it('passes a standby subject that approved one of its finals', () => {
    expect(isPassed({ outcome: 'finalPendiente', hasApprovedFinal: true })).toBe(true)
  })

  it('does not pass a standby subject with no approved final', () => {
    expect(isPassed({ outcome: 'finalPendiente', hasApprovedFinal: false })).toBe(false)
  })

  it('respects an explicit reprobada even against an approved final', () => {
    expect(isPassed({ outcome: 'reprobada', hasApprovedFinal: true })).toBe(false)
  })

  it('does not pass a subject that was never closed', () => {
    expect(isPassed({ outcome: null, hasApprovedFinal: false })).toBe(false)
  })

  // Pins isPassed to resolveSubjectStatus so the compact list-payload rule
  // and the full state machine can never drift apart.
  it('agrees with resolveSubjectStatus on every outcome/final combination', () => {
    const outcomes: (SubjectOutcome | null)[] = [null, 'aprobada', 'reprobada', 'finalPendiente']

    for (const outcome of outcomes) {
      for (const hasApprovedFinal of [true, false]) {
        const finals = hasApprovedFinal ? [{ result: 'aprobado' as const }] : [{ result: 'reprobado' as const }]
        const status = resolveSubjectStatus({ outcome, period: finishedPeriod, finals }, today)

        expect({ outcome, hasApprovedFinal, passed: isPassed({ outcome, hasApprovedFinal }) }).toEqual({
          outcome,
          hasApprovedFinal,
          passed: status === 'aprobada'
        })
      }
    }
  })
})

describe('matchesStatusFilter', () => {
  it('lets everything through under todas', () => {
    expect(matchesStatusFilter('sinCerrar', 'todas')).toBe(true)
    expect(matchesStatusFilter('cursando', 'todas')).toBe(true)
  })

  it('shows only the subjects being taken right now under activas', () => {
    expect(matchesStatusFilter('cursando', 'activas')).toBe(true)
    expect(matchesStatusFilter('standby', 'activas')).toBe(false)
    expect(matchesStatusFilter('aprobada', 'activas')).toBe(false)
  })

  it('maps each remaining filter onto its own status', () => {
    expect(matchesStatusFilter('standby', 'standby')).toBe(true)
    expect(matchesStatusFilter('aprobada', 'aprobadas')).toBe(true)
    expect(matchesStatusFilter('reprobada', 'reprobadas')).toBe(true)
    expect(matchesStatusFilter('sinCerrar', 'sinCerrar')).toBe(true)
    expect(matchesStatusFilter('aprobada', 'reprobadas')).toBe(false)
  })
})
