import { computeWeeklyMinutes } from '../../materias/domain/subjectDetail'
import { projectWeek, type WeekProjectionSubject } from '../../horario/domain/weekProjection'

// Pure, framework-free domain module (design §4, §3a). MUST NOT import
// electron or better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule.
//
// What the DRAFT looks like as a week: where it collides with itself, and what
// it costs. Both answers come out of the same `schedule_slots` the Horario grid
// already renders, through the same helpers — `projectWeek` for the
// Monday-first grouping and `computeWeeklyMinutes` for the arithmetic. A
// parallel grouping here would be a second week, free to disagree with the one
// the student is looking at on the next screen.

/**
 * A drafted materia, exactly as the Horario projection already types one.
 * Aliased rather than re-declared so the two can never drift, and so
 * `materias:list` rows satisfy this structurally with no adapter.
 */
export type DraftSubject = WeekProjectionSubject

/** One overlap between two drafted materias, on one day. */
export interface ScheduleClash {
  first: { id: number; name: string }
  second: { id: number; name: string }
  /** Stored Sunday-based `dayOfWeek` — 0=Sunday..6=Saturday (schema.ts). */
  dayOfWeek: number
  /** The OVERLAPPING window, not either class's own hours: `[start, end)`. */
  startMinutes: number
  endMinutes: number
}

/**
 * Every collision inside the draft, in Monday-first day order.
 *
 * The comparison is STRICT on both ends (`aStart < bEnd && bStart < aEnd`), so
 * TOUCHING ENDPOINTS DO NOT CLASH: a class ending 21:00 and one starting 21:00
 * is a real timetable — you walk out of one and into the other. Reporting it
 * would be the notice crying wolf, and a notice that cries wolf is one the
 * student stops reading, which costs them the real collision underneath.
 *
 * Two slots of the SAME materia never clash: a subject cannot collide with its
 * own timetable, and if it overlaps itself that is a mistake to fix in Editar
 * materia, not a conflict between two plans.
 *
 * This reports; it never rejects. The approved design says it outright — "el
 * planificador avisa, no decide" — so nothing downstream may use this to block
 * a draft line.
 */
export function findScheduleClashes(subjects: readonly DraftSubject[]): ScheduleClash[] {
  const clashes: ScheduleClash[] = []

  // Monday-first, and each day already sorted by start time — the same
  // projection the Horario grid draws, so the notices read in the order the
  // week runs.
  for (const column of projectWeek([...subjects])) {
    for (let index = 0; index < column.slots.length; index += 1) {
      for (let other = index + 1; other < column.slots.length; other += 1) {
        const left = column.slots[index]!
        const right = column.slots[other]!
        if (left.subjectId === right.subjectId) {
          continue
        }
        if (left.startMinutes >= right.endMinutes || right.startMinutes >= left.endMinutes) {
          continue
        }
        clashes.push({
          first: { id: left.subjectId, name: left.subjectName },
          second: { id: right.subjectId, name: right.subjectName },
          dayOfWeek: column.dayOfWeek,
          startMinutes: Math.max(left.startMinutes, right.startMinutes),
          endMinutes: Math.min(left.endMinutes, right.endMinutes)
        })
      }
    }
  }

  return clashes
}

export interface WeeklyLoad {
  /** Total class time per week, in minutes. Callers format to hours. */
  totalMinutes: number
  /** How many classes you walk into in a week — slots, not materias. */
  classCount: number
  subjectCount: number
}

/**
 * What the draft costs per week, over the SAME slots the clash check reads.
 *
 * A drafted materia with no horario loaded still counts as a materia: it is in
 * the plan, and what it costs is simply not known yet. Dropping it from the
 * count would make the card disagree with the list right above it.
 */
export function summarizeWeeklyLoad(subjects: readonly DraftSubject[]): WeeklyLoad {
  const slots = subjects.flatMap((subject) => subject.slots)
  return {
    totalMinutes: computeWeeklyMinutes(slots),
    classCount: slots.length,
    subjectCount: subjects.length
  }
}

/**
 * The load the CARGA SEMANAL track is drawn against: 30 hours a week.
 *
 * A REFERENCE, never a limit — nothing in this app refuses a draft for
 * crossing it. It exists because a bar has to be a fraction of something, and
 * a full-time cursada is the honest something: around six materias of five
 * hours. It is stated here, once, so the number is a documented choice instead
 * of a magic constant buried in a `style={{ width }}`.
 */
export const WEEKLY_LOAD_REFERENCE_MINUTES = 30 * 60

/** Where the draft sits against {@link WEEKLY_LOAD_REFERENCE_MINUTES}, as 0..1. Capped so the fill never overflows its track. */
export function weeklyLoadFraction(totalMinutes: number): number {
  return Math.min(1, totalMinutes / WEEKLY_LOAD_REFERENCE_MINUTES)
}
