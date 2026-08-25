import { describe, expect, it } from 'vitest'
import { formatClassDayMonth, formatClassDateLong } from './classDate'

describe('formatClassDayMonth', () => {
  // The apuntes row's date cell — "14 ago", the approved design's own copy.
  // The year is absent for the same reason the carrera card's dates drop it:
  // the list belongs to one cursada, and four extra characters would crowd a
  // 70px cell.
  it('formats a class date as day and short month', () => {
    expect(formatClassDayMonth('2026-08-14')).toBe('14 ago')
  })

  it('keeps the leading zero the design draws', () => {
    expect(formatClassDayMonth('2026-08-07')).toBe('07 ago')
  })

  // Repo-wide convention: a malformed date renders UNFORMATTED. Showing the
  // stored string beats interpolating "undefined" into the list.
  it('renders a malformed date unformatted', () => {
    expect(formatClassDayMonth('14/08/2026')).toBe('14/08/2026')
  })

  it('renders an out-of-range month unformatted', () => {
    expect(formatClassDayMonth('2026-13-14')).toBe('2026-13-14')
  })
})

describe('formatClassDateLong', () => {
  // The modal's header: "Clase del jueves 14 de agosto". 2026-08-14 is a
  // Friday; 2026-08-13 is the Thursday.
  it('spells the class date out with its weekday', () => {
    expect(formatClassDateLong('2026-08-13')).toBe('jueves 13 de agosto')
  })

  // Mid-sentence, so Spanish lowercases the weekday — the same rule Hoy's
  // empty state already applies to "el lunes".
  it('lowercases the weekday', () => {
    expect(formatClassDateLong('2026-08-17')).toBe('lunes 17 de agosto')
  })

  it('drops the leading zero in the spelled-out form', () => {
    expect(formatClassDateLong('2026-08-07')).toBe('viernes 7 de agosto')
  })

  it('renders a malformed date unformatted', () => {
    expect(formatClassDateLong('nope')).toBe('nope')
  })
})
