import { describe, expect, it } from 'vitest'
import { collectBusySlots, type BusySlotSubject } from './busySlots'

const NOW = new Date(2026, 7, 26)

function subject(overrides: Partial<BusySlotSubject> & Pick<BusySlotSubject, 'id' | 'name'>): BusySlotSubject {
  return {
    outcome: null,
    finals: [],
    period: { startsOn: '2026-08-01', endsOn: '2026-12-15' },
    slots: [],
    ...overrides
  }
}

describe('collectBusySlots', () => {
  it('flattens every slot of every subject, tagged with its subject name', () => {
    const busy = collectBusySlots(
      [
        subject({
          id: 1,
          name: 'ITICS',
          slots: [
            { dayOfWeek: 1, startMinutes: 480, endMinutes: 540 },
            { dayOfWeek: 3, startMinutes: 600, endMinutes: 660 }
          ]
        })
      ],
      { now: NOW }
    )

    expect(busy).toEqual([
      { subjectName: 'ITICS', dayOfWeek: 1, startMinutes: 480, endMinutes: 540 },
      { subjectName: 'ITICS', dayOfWeek: 3, startMinutes: 600, endMinutes: 660 }
    ])
  })

  // The subject being edited supplies its own rows through the form; counting
  // its SAVED slots too would make every unchanged row warn about itself.
  it('drops the subject being edited', () => {
    const busy = collectBusySlots(
      [
        subject({ id: 1, name: 'ITICS', slots: [{ dayOfWeek: 1, startMinutes: 480, endMinutes: 540 }] }),
        subject({ id: 2, name: 'Análisis', slots: [{ dayOfWeek: 1, startMinutes: 480, endMinutes: 540 }] })
      ],
      { now: NOW, excludeSubjectId: 1 }
    )

    expect(busy).toEqual([{ subjectName: 'Análisis', dayOfWeek: 1, startMinutes: 480, endMinutes: 540 }])
  })

  // Same rule the grid applies: a subject that no longer attends classes
  // occupies no time, so it must not warn about an hour that is actually free.
  it('drops a subject that no longer attends classes', () => {
    const busy = collectBusySlots(
      [
        subject({
          id: 1,
          name: 'Aprobada',
          outcome: 'aprobada',
          slots: [{ dayOfWeek: 1, startMinutes: 480, endMinutes: 540 }]
        })
      ],
      { now: NOW }
    )

    expect(busy).toEqual([])
  })

  it('returns nothing for an empty subject list', () => {
    expect(collectBusySlots([], { now: NOW })).toEqual([])
  })
})
