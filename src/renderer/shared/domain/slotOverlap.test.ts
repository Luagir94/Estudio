import { describe, expect, it } from 'vitest'
import { findSlotOverlaps, slotsOverlap, type BusySpan, type TimeSpan } from './slotOverlap'

function span(dayOfWeek: number, startMinutes: number, endMinutes: number): TimeSpan {
  return { dayOfWeek, startMinutes, endMinutes }
}

function busy(subjectName: string, dayOfWeek: number, startMinutes: number, endMinutes: number): BusySpan {
  return { subjectName, dayOfWeek, startMinutes, endMinutes }
}

describe('slotsOverlap', () => {
  it('does not collide across different days at the same hours', () => {
    expect(slotsOverlap(span(1, 480, 540), span(2, 480, 540))).toBe(false)
  })

  // Half-open intervals: a class ending at 09:00 and one starting at 09:00
  // are back-to-back, not a conflict. Treating them as one would warn on the
  // single most common way of scheduling two classes in a row.
  it('treats back-to-back classes as free, not overlapping', () => {
    expect(slotsOverlap(span(1, 480, 540), span(1, 540, 600))).toBe(false)
    expect(slotsOverlap(span(1, 540, 600), span(1, 480, 540))).toBe(false)
  })

  it('collides on a partial overlap, in both argument orders', () => {
    expect(slotsOverlap(span(1, 480, 600), span(1, 540, 660))).toBe(true)
    expect(slotsOverlap(span(1, 540, 660), span(1, 480, 600))).toBe(true)
  })

  it('collides when one span contains the other', () => {
    expect(slotsOverlap(span(1, 480, 720), span(1, 540, 600))).toBe(true)
    expect(slotsOverlap(span(1, 540, 600), span(1, 480, 720))).toBe(true)
  })

  it('collides on identical spans', () => {
    expect(slotsOverlap(span(1, 480, 540), span(1, 480, 540))).toBe(true)
  })

  // A row being typed passes through half-finished states (`08:00 – 08:00`
  // while the end time is still being picked). An empty span occupies no
  // time, so it cannot collide with anything — warning there would fire on
  // every keystroke.
  it('never collides when either span is empty or inverted', () => {
    expect(slotsOverlap(span(1, 480, 480), span(1, 480, 540))).toBe(false)
    expect(slotsOverlap(span(1, 480, 540), span(1, 600, 480))).toBe(false)
  })
})

describe('findSlotOverlaps', () => {
  it('returns one entry per slot, in the same order, empty when nothing collides', () => {
    const result = findSlotOverlaps([span(1, 480, 540), span(3, 600, 660)], [busy('Redes', 5, 480, 540)])

    expect(result).toEqual([[], []])
  })

  it('reports the busy span a slot collides with, carrying its subject name', () => {
    const result = findSlotOverlaps([span(1, 480, 600)], [busy('Bases de Datos', 1, 540, 660)])

    expect(result).toEqual([[busy('Bases de Datos', 1, 540, 660)]])
  })

  // Two rows of the SAME subject can collide with each other just as easily
  // as with another subject's class. Those carry no subject name — the
  // caller has no name to show that would not just repeat the form's title.
  it('reports a collision between two rows of the subject being edited, with no subject name', () => {
    const result = findSlotOverlaps([span(1, 480, 600), span(1, 540, 660)], [])

    expect(result).toEqual([
      [{ subjectName: null, dayOfWeek: 1, startMinutes: 540, endMinutes: 660 }],
      [{ subjectName: null, dayOfWeek: 1, startMinutes: 480, endMinutes: 600 }]
    ])
  })

  it('never reports a slot as colliding with itself', () => {
    expect(findSlotOverlaps([span(1, 480, 540)], [])).toEqual([[]])
  })

  it('collects every collision a single slot has', () => {
    const result = findSlotOverlaps(
      [span(1, 480, 720), span(1, 540, 600)],
      [busy('Redes', 1, 600, 660), busy('Álgebra', 2, 480, 720)]
    )

    expect(result[0]).toEqual([
      { subjectName: null, dayOfWeek: 1, startMinutes: 540, endMinutes: 600 },
      busy('Redes', 1, 600, 660)
    ])
    expect(result[1]).toEqual([{ subjectName: null, dayOfWeek: 1, startMinutes: 480, endMinutes: 720 }])
  })
})
