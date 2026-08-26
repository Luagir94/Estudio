// Pure, framework-free domain module (design §4): turns the `materias:list`
// payload into the set of hours already taken, which is what the slot editor
// warns against while a class is being loaded.
//
// It answers the SAME question the Horario grid answers when it decides
// which subjects get a column — so it applies the same rule (`attendsClasses`)
// rather than a looser one of its own. A closed subject occupies no time; a
// warning about an hour that is actually free is worse than no warning.
import type { BusySpan } from '../../shared/domain/slotOverlap'
import { attendsClasses, resolveSubjectStatus, type SubjectStatusInput } from './subjectStatus'

export interface BusySlotSubject extends SubjectStatusInput {
  id: number
  name: string
  slots: Array<{ dayOfWeek: number; startMinutes: number; endMinutes: number }>
}

export interface CollectBusySlotsOptions {
  /** Today, for resolving each subject's status. Injected — a clock read inside is untestable. */
  now: Date
  /**
   * The subject whose form is open. Its saved slots are excluded because the
   * form already carries them as editable rows: counting both would make
   * every unchanged row warn about itself.
   */
  excludeSubjectId?: number | null
}

/** Every class hour other subjects still attend, flattened and tagged with the subject's name. */
export function collectBusySlots(
  subjects: readonly BusySlotSubject[],
  { now, excludeSubjectId = null }: CollectBusySlotsOptions
): BusySpan[] {
  return subjects
    .filter((subject) => subject.id !== excludeSubjectId)
    .filter((subject) => attendsClasses(resolveSubjectStatus(subject, now)))
    .flatMap((subject) =>
      subject.slots.map((slot) => ({
        subjectName: subject.name,
        dayOfWeek: slot.dayOfWeek,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes
      }))
    )
}
