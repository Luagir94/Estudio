import { differenceInCalendarDays, parseISO } from 'date-fns'
import { z } from 'zod'
import i18n from '../../i18n'

// Pure, framework-free domain module (design §4). MUST NOT import electron
// or better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule (see tooling/dependencyGuard.test.ts).
//
// Deadline owns its own lifecycle (design amendment 7, §2 "Deliberate
// lifecycle asymmetry") — unlike ScheduleSlot, it is NOT managed only
// through its aggregate root. This module is the single source of truth for
// "how a deadline classifies against the clock", consumed by both the
// Entregas screen's bucket grouping and its individual status pill text
// (design node `AHToB` — DeadlineRow's "Status Pill").

// `fecha límite` is a LOCAL NAIVE datetime, `YYYY-MM-DDTHH:mm`, no timezone
// offset (design §3a "the DST rule") — an offset-bearing string like a `Z`
// suffix is rejected here, not silently accepted and reinterpreted.
//
// Validation messages are STABLE MACHINE KEYS, not prose — same convention
// as shared/ipc/entregas.ts's `createDeadlineInputSchema` (this module is
// framework-free too, per the design §4 domain-module rule at the top of
// this file — it must not assume an i18n instance is ever wired up).
const localNaiveDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'dateTime.invalid')

export const deadlineSchema = z.object({
  title: z.string().trim().min(1, 'title.required'),
  subjectId: z.number().int(),
  type: z.string().trim().min(1, 'type.required'),
  dueAt: localNaiveDateTimeSchema,
  done: z.boolean().default(false)
})

export type DeadlineInput = z.infer<typeof deadlineSchema>

/** Minimal, zod-version-agnostic issue shape — only what callers need. */
export interface DeadlineValidationIssue {
  path: PropertyKey[]
  message: string
}

export type DeadlineValidationResult =
  { ok: true; deadline: DeadlineInput } | { ok: false; errors: DeadlineValidationIssue[] }

/**
 * Validates a raw payload against the Deadline entity shape (spec: "Deadline
 * Fields and Lifecycle" — título/materia/tipo/fecha límite required, done
 * defaults false). Pure function: no side effects, no I/O.
 */
export function createDeadline(input: unknown): DeadlineValidationResult {
  const result = deadlineSchema.safeParse(input)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
    }
  }
  return { ok: true, deadline: result.data }
}

/**
 * Whole CALENDAR days between `now` and `dueAt` (spec: "Days-Remaining
 * Calendar-Day Computation" — `differenceInCalendarDays`, never elapsed
 * hours, so classification stays correct near midnight). `dueAt` is parsed
 * via `parseISO`, which — for an offset-free string — yields a LOCAL date
 * (design §3a), matching the naive-local storage convention exactly.
 */
export function daysRemaining(dueAt: string, now: Date): number {
  return differenceInCalendarDays(parseISO(dueAt), now)
}

export type DeadlineBucket = 'atrasadas' | 'proximos7' | 'masAdelante' | 'completadas'

/**
 * Buckets a single deadline (spec: "entregas:list (grouped buckets
 * including ATRASADAS)"). `done` is checked FIRST and unconditionally routes
 * to `completadas` — a deadline completed after its due date must never
 * read as overdue (spec: "Toggle done/pending" — "no partial-progress state
 * exists").
 */
export function classifyDeadline(dueAt: string, done: boolean, now: Date): DeadlineBucket {
  if (done) {
    return 'completadas'
  }
  const days = daysRemaining(dueAt, now)
  if (days < 0) {
    return 'atrasadas'
  }
  if (days <= 7) {
    return 'proximos7'
  }
  return 'masAdelante'
}

/**
 * Status pill copy (design node `AHToB`'s "Status Text", verified via the
 * Pencil MCP tools against every example row in the Entregas mockup:
 * "2 días de atraso", "Mañana", "En 4 días", "En 6 días", "En 7 días",
 * "En 2 semanas", "Completada").
 */
export function formatDeadlineStatus(dueAt: string, done: boolean, now: Date): string {
  if (done) {
    return i18n.t('entregas:deadlineStatus.completed')
  }
  const days = daysRemaining(dueAt, now)
  if (days < 0) {
    return i18n.t('entregas:deadlineStatus.overdue', { count: Math.abs(days) })
  }
  if (days === 0) {
    return i18n.t('entregas:deadlineStatus.today')
  }
  if (days === 1) {
    return i18n.t('entregas:deadlineStatus.tomorrow')
  }
  if (days < 14) {
    return i18n.t('entregas:deadlineStatus.inDays', { days })
  }
  return i18n.t('entregas:deadlineStatus.inWeeks', { weeks: Math.round(days / 7) })
}

export interface DeadlineLike {
  dueAt: string
  done: boolean
}

export type GroupedDeadlines<T extends DeadlineLike> = Record<DeadlineBucket, T[]>

/**
 * Groups a flat deadline list into the four Entregas screen buckets (design
 * node `K6MVx`: ATRASADAS/PRÓXIMOS 7 DÍAS/MÁS ADELANTE/COMPLETADAS), sorted
 * by fecha límite ascending within each group. Grouping happens HERE, at
 * render time, not baked into the IPC payload — "now" is a rendering-time
 * concern (same precedent as `shared/ipc/materias.ts`'s `subjectDetailSchema`
 * comment: baking "now" into a cached payload would go stale between
 * renders).
 */
export function groupDeadlines<T extends DeadlineLike>(deadlines: T[], now: Date): GroupedDeadlines<T> {
  const groups: GroupedDeadlines<T> = { atrasadas: [], proximos7: [], masAdelante: [], completadas: [] }
  for (const deadline of deadlines) {
    groups[classifyDeadline(deadline.dueAt, deadline.done, now)].push(deadline)
  }
  for (const bucket of Object.keys(groups) as DeadlineBucket[]) {
    groups[bucket] = [...groups[bucket]].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  }
  return groups
}
