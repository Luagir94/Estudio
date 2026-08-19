import { addDays, isBefore, set, startOfDay } from 'date-fns'

// Pure, framework-free domain module (design §4, §3a). MUST NOT import
// electron or better-sqlite3 — enforced by .dependency-cruiser.cjs's
// no-electron-or-sqlite-in-domain rule. Computes the subject-detail read
// model values (spec: "Computed Detail Values") from existing slot/deadline
// data — introduces zero new persisted fields.

export interface SubjectDetailSlot {
  /** Stored Sunday-based `dayOfWeek` — 0=Sunday..6=Saturday (schema.ts). */
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
}

export interface SubjectDetailDeadline {
  done: boolean
}

/** Progreso: completed/total deadlines (spec: "Progreso reflects deadline completion ratio"). */
export function computeProgreso(deadlines: SubjectDetailDeadline[]): { done: number; total: number } {
  return {
    done: deadlines.filter((deadline) => deadline.done).length,
    total: deadlines.length
  }
}

/**
 * Horas/semana: sum of `endMinutes - startMinutes` across every slot (design
 * §3a: "pure integer math over stored minutes; date-fns only formats").
 * Returns total minutes — callers format to hours for display.
 */
export function computeWeeklyMinutes(slots: SubjectDetailSlot[]): number {
  return slots.reduce((total, slot) => total + (slot.endMinutes - slot.startMinutes), 0)
}

/**
 * Composes the next concrete Date a given slot occurs at, at or after `now`.
 * Built from a LOCAL calendar date (via `startOfDay`/`addDays`, which
 * operate on calendar days, not fixed 24h/ms multiples) with the slot's
 * stored minutes applied via `set` — this is what keeps the result DST-safe
 * (design §3a "the DST rule").
 */
function nextOccurrenceForSlot(slot: SubjectDetailSlot, now: Date): Date {
  const currentDayOfWeek = now.getDay()
  const dayDelta = (slot.dayOfWeek - currentDayOfWeek + 7) % 7

  const candidateDay = addDays(startOfDay(now), dayDelta)
  const candidate = set(candidateDay, {
    hours: Math.floor(slot.startMinutes / 60),
    minutes: slot.startMinutes % 60,
    seconds: 0,
    milliseconds: 0
  })

  // dayDelta === 0 means "today" — if that slot's start time already passed
  // today, the next occurrence is a full week later, not "today" again.
  return isBefore(candidate, now) ? addDays(candidate, 7) : candidate
}

/**
 * Próxima clase: the nearest future occurrence across all of a subject's
 * slots, relative to `now` (spec: "Próxima clase reflects the nearest
 * future occurrence"). Returns null when the subject has no slots.
 */
export function getNextClassOccurrence(slots: SubjectDetailSlot[], now: Date): Date | null {
  if (slots.length === 0) {
    return null
  }

  return slots
    .map((slot) => nextOccurrenceForSlot(slot, now))
    .reduce((earliest, occurrence) => (isBefore(occurrence, earliest) ? occurrence : earliest))
}
