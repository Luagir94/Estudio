// Pure, framework-free domain module (design §4, §3a). MUST NOT import
// electron or better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule.
//
// This module is where the feature's load-bearing decision is actually
// executed. Attendance marks and class apuntes are anchored by
// `(subjectId, date)` and NOTHING dated is materialized: `schedule_slots` is
// a weekly recurrence pattern whose rows are replaced wholesale by every
// `materias:updateSchedule`, so a mark hanging off a slot id would be
// cascade-deleted the first time the student fixed their horario.
//
// The concrete class — which slot, at what time, in which aula — is therefore
// COMPOSED at read time by crossing a date with the slots currently in
// effect, exactly the way the pure `projectWeek()` in
// `horario/domain/weekProjection.ts` composes a week out of the same pattern.
// Nothing here is stored, and nothing here can be invalidated by an edit to
// the schedule: the worst an edit can do is leave an occurrence unresolvable,
// which is a display question, not a data loss.
import { format, parseISO } from 'date-fns'
import type { AttendanceRecord, AttendanceStatus, ClassNoteRecord } from '../../../shared/ipc/materias'

/** The slice of a schedule slot an occurrence needs. Structural on purpose — records and form values both fit. */
export interface ClassSlotLike {
  /** Stored Sunday-based day — 0=Sunday..6=Saturday (schema.ts), matching `Date.getDay()`. */
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
  location: string | null
}

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * The LOCAL calendar day of a `Date`, in the `YYYY-MM-DD` form marks and
 * apuntes are stored under.
 *
 * `format`, never `toISOString()`: the latter converts to UTC and would shift
 * the calendar day for anyone marking a late-evening class west of Greenwich
 * — the mark would quietly land on tomorrow (design §3a "the DST rule", the
 * same reason `registerAppHandlers` formats its export timestamp this way).
 */
export function toLocalIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * The class that happened on `date`, composed from the weekly pattern.
 *
 * `null` means the pattern has no class that weekday — which is the honest
 * answer for an apunte written before the horario was corrected. The mark and
 * the apunte survive (they are anchored to the day, not the slot); only their
 * time and aula become unknown, and callers say so rather than inventing one.
 *
 * When a subject meets TWICE on the same weekday, the earliest slot is the
 * representative occurrence: the anchor is the DAY, so both classes share one
 * mark and one apunte, and picking the later one would name the wrong start
 * time for a mark made in the morning.
 */
export function resolveClassOccurrence<Slot extends ClassSlotLike>(slots: Slot[], date: string): Slot | null {
  if (!LOCAL_DATE_PATTERN.test(date)) {
    return null
  }
  const dayOfWeek = parseISO(date).getDay()
  return slots.filter((slot) => slot.dayOfWeek === dayOfWeek).sort((a, b) => a.startMinutes - b.startMinutes)[0] ?? null
}

/**
 * The mark for one class, or `null` for an UNMARKED one — which is the
 * absence of a row, never a fourth status value. The pair is the key: same
 * subject on another day, or another subject on the same day, is a different
 * class.
 */
export function findAttendanceStatus(
  marks: AttendanceRecord[],
  subjectId: number,
  date: string
): AttendanceStatus | null {
  return marks.find((mark) => mark.subjectId === subjectId && mark.date === date)?.status ?? null
}

/** The apunte for one class, or `null` when that class has none. Same pair-as-key rule. */
export function findClassNote(notes: ClassNoteRecord[], subjectId: number, date: string): ClassNoteRecord | null {
  return notes.find((note) => note.subjectId === subjectId && note.date === date) ?? null
}
