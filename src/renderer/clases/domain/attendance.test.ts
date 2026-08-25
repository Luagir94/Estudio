import { describe, expect, it } from 'vitest'
import { summarizeAttendance } from './attendance'

function marks(...statuses: Array<'presente' | 'ausente' | 'feriado'>) {
  return statuses.map((status) => ({ status }))
}

describe('summarizeAttendance', () => {
  // The approved card's own numbers: 12 presentes, 2 ausentes → "12 de 14",
  // "86% presente".
  it('counts presentes over presentes plus ausentes', () => {
    const summary = summarizeAttendance(marks(...Array(12).fill('presente'), 'ausente', 'ausente'), 75)

    expect(summary.present).toBe(12)
    expect(summary.counted).toBe(14)
    expect(summary.percent).toBe(86)
  })

  // The load-bearing rule: a cancelled class is not one you missed, and not
  // one you attended. It leaves the ratio entirely.
  it('excludes feriados from BOTH sides of the ratio', () => {
    const summary = summarizeAttendance(marks('presente', 'presente', 'feriado', 'feriado'), null)

    expect(summary.present).toBe(2)
    expect(summary.absent).toBe(0)
    expect(summary.counted).toBe(2)
    expect(summary.percent).toBe(100)
  })

  it('does not let a feriado rescue a failing ratio', () => {
    const withoutFeriado = summarizeAttendance(marks('presente', 'ausente'), null)
    const withFeriado = summarizeAttendance(marks('presente', 'ausente', 'feriado'), null)

    expect(withFeriado.percent).toBe(withoutFeriado.percent)
  })

  describe('no data', () => {
    // NOT 0%. Zero marks means the question has not been asked yet, and a 0%
    // would read as "you have missed everything" — the opposite of the truth.
    it('reports no percentage at all when nothing was marked', () => {
      const summary = summarizeAttendance([], 75)

      expect(summary.percent).toBeNull()
      expect(summary.counted).toBe(0)
      expect(summary.meetsMinimum).toBeNull()
    })

    it('reports no percentage when only feriados were marked', () => {
      const summary = summarizeAttendance(marks('feriado', 'feriado'), 75)

      expect(summary.percent).toBeNull()
      expect(summary.counted).toBe(0)
      expect(summary.meetsMinimum).toBeNull()
    })
  })

  describe('against the subject`s minimum', () => {
    it('meets a minimum it sits above', () => {
      expect(summarizeAttendance(marks('presente', 'presente', 'presente', 'ausente'), 70).meetsMinimum).toBe(true)
    })

    it('meets a minimum it sits exactly on', () => {
      expect(summarizeAttendance(marks('presente', 'presente', 'presente', 'ausente'), 75).meetsMinimum).toBe(true)
    })

    it('fails a minimum it sits below', () => {
      expect(summarizeAttendance(marks('presente', 'presente', 'ausente', 'ausente'), 75).meetsMinimum).toBe(false)
    })

    // The displayed number is a ROUNDED reading; the verdict answers the real
    // ratio, because the ratio is what the cátedra will compute. 6/7 reads
    // "86%" and is genuinely below a 90% minimum.
    it('judges the exact ratio, not the rounded one', () => {
      const summary = summarizeAttendance(
        marks('presente', 'presente', 'presente', 'presente', 'presente', 'presente', 'ausente'),
        86
      )

      expect(summary.percent).toBe(86)
      expect(summary.meetsMinimum).toBe(false)
    })

    // No minimum declared is not "a minimum of zero": the subject simply does
    // not make a claim, so the card reports the number with no verdict.
    it('returns no verdict when the subject declares no minimum', () => {
      const summary = summarizeAttendance(marks('presente', 'ausente'), null)

      expect(summary.percent).toBe(50)
      expect(summary.meetsMinimum).toBeNull()
    })
  })
})
