// Pure, framework-free domain module (design §4). Answers ONE question:
// which schedule slots occupy the same minutes of the same weekday. Two
// screens ask it for different reasons — the slot editor warns before a
// clashing class is saved, and the Horario grid lays clashing classes out
// side by side instead of stacking them — so the rule lives here once
// rather than in each caller. MUST NOT import electron or better-sqlite3
// (tooling/dependencyGuard.mts).

/** A weekly recurrence: stored Sunday-based `dayOfWeek` (schema.ts) + minutes of day. */
export interface TimeSpan {
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
}

/** An already-committed span the user is scheduling against. */
export interface BusySpan extends TimeSpan {
  /**
   * Whose class this is. `null` means "another row of the subject currently
   * being edited" — there is no OTHER subject to name in that case.
   */
  subjectName: string | null
}

/**
 * Whether two weekly recurrences fight over the same minutes.
 *
 * Intervals are HALF-OPEN: `[start, end)`. A class ending at 09:00 and one
 * starting at 09:00 are back-to-back, which is the most common way of
 * stacking two classes and must not read as a conflict.
 *
 * An empty or inverted span (`end <= start`) occupies no time and therefore
 * collides with nothing — the slot editor walks through exactly that state
 * while a time input is half-typed.
 */
export function slotsOverlap(a: TimeSpan, b: TimeSpan): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) {
    return false
  }
  if (a.endMinutes <= a.startMinutes || b.endMinutes <= b.startMinutes) {
    return false
  }
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes
}

/**
 * For every entry of `slots`, the spans it collides with: the OTHER entries
 * of `slots` first (a subject can double-book itself), then the `busy`
 * spans other subjects already hold. The result is parallel to `slots`, so
 * `result[i]` belongs to `slots[i]` — a row can render its own warning
 * without matching anything back up by identity.
 */
export function findSlotOverlaps(slots: TimeSpan[], busy: BusySpan[]): BusySpan[][] {
  return slots.map((slot, index) => {
    const siblings = slots
      .filter((other, otherIndex) => otherIndex !== index && slotsOverlap(slot, other))
      .map((other) => ({ subjectName: null, ...toSpan(other) }))
    const others = busy.filter((candidate) => slotsOverlap(slot, candidate))
    return [...siblings, ...others]
  })
}

function toSpan({ dayOfWeek, startMinutes, endMinutes }: TimeSpan): TimeSpan {
  return { dayOfWeek, startMinutes, endMinutes }
}
