// Presentational, shared across "Nueva materia" (slice 2a) and "Editar
// materia" (slice 2b): a fully controlled schedule-slot list editor. It
// emits `slots[]` via onChange and persists nothing itself (design §4).
import type { ChangeEvent } from 'react'
import { Plus, TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { findSlotOverlaps, type BusySpan } from '../domain/slotOverlap'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'

export interface SlotEditorValue {
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
  // RHF's field value reflects the pre-parse (Zod "input") shape, where a
  // `.default(null)` field is still optional going in — so this accepts
  // undefined even though this component always writes back string|null.
  location?: string | null
}

interface SlotEditorProps {
  value: SlotEditorValue[]
  onChange: (slots: SlotEditorValue[]) => void
  /**
   * Classes OTHER subjects already hold this cuatrimestre, so a clash is
   * caught while the class is being loaded instead of being discovered on
   * the weekly grid afterwards. Containers supply it (design §4: components
   * receive props); omitting it leaves the warning covering only collisions
   * between this subject's own rows, which is still worth having.
   */
  busySlots?: BusySpan[]
}

// dayOfWeek matches JS `Date.getDay()` (0=Sunday..6=Saturday) so the
// weekly-schedule projection (slice 3) can compose occurrences directly
// with date-fns without a translation table. The values below still list
// options Monday-first for the UI (design's Monday-start week convention) —
// which is exactly `common:weekdaysLong`'s order, so value n pairs with
// label n by index alone.
const DAY_OPTION_VALUES = [1, 2, 3, 4, 5, 6, 0]

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const mins = (minutes % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

function timeToMinutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number)
  return (hours || 0) * 60 + (mins || 0)
}

export function SlotEditor({ value, onChange, busySlots = [] }: SlotEditorProps): React.JSX.Element {
  const { t } = useTranslation('common')
  const weekdayLabels = t('weekdaysLong', { returnObjects: true }) as string[]
  // Parallel to `value` — index i holds row i's collisions (see
  // `findSlotOverlaps`), so a row renders its own warning without matching
  // anything back up by identity.
  const overlapsPerSlot = findSlotOverlaps(value, busySlots)

  /** Monday-first label for a stored Sunday-based `dayOfWeek`, via the option order above. */
  function dayLabel(dayOfWeek: number): string {
    return weekdayLabels[DAY_OPTION_VALUES.indexOf(dayOfWeek)] ?? ''
  }

  function updateSlot(index: number, patch: Partial<SlotEditorValue>): void {
    onChange(value.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)))
  }

  function addSlot(): void {
    onChange([...value, { dayOfWeek: 1, startMinutes: 8 * 60, endMinutes: 9 * 60, location: null }])
  }

  function removeSlot(index: number): void {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((slot, index) => (
        <div
          key={index}
          className="grid grid-cols-[1.3fr_1fr_1fr_1fr_auto] items-end gap-3 rounded-lg border border-border p-3"
        >
          <Label className="mb-0 flex flex-col gap-1">
            {t('slotEditor.day')}
            <Select
              value={slot.dayOfWeek}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                updateSlot(index, { dayOfWeek: Number(event.target.value) })
              }
            >
              {DAY_OPTION_VALUES.map((dayValue, dayIndex) => (
                <option key={dayValue} value={dayValue}>
                  {weekdayLabels[dayIndex]}
                </option>
              ))}
            </Select>
          </Label>
          <Label className="mb-0 flex flex-col gap-1">
            {t('slotEditor.startTime')}
            <Input
              type="time"
              value={minutesToTime(slot.startMinutes)}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateSlot(index, { startMinutes: timeToMinutes(event.target.value) })
              }
            />
          </Label>
          <Label className="mb-0 flex flex-col gap-1">
            {t('slotEditor.endTime')}
            <Input
              type="time"
              value={minutesToTime(slot.endMinutes)}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateSlot(index, { endMinutes: timeToMinutes(event.target.value) })
              }
            />
          </Label>
          <Label className="mb-0 flex flex-col gap-1">
            {t('slotEditor.location')}
            <Input
              type="text"
              value={slot.location ?? ''}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateSlot(index, { location: event.target.value.trim().length > 0 ? event.target.value : null })
              }
            />
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeSlot(index)}
            aria-label={t('slotEditor.removeSlot')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>

          {/* A WARNING, not a validation error: overlapping classes are a
              real situation (two commissions of the same subject, a slot you
              still have to choose between), and the grid now draws both side
              by side. So this informs and lets the form through — turning it
              into an error would forbid a schedule the user legitimately
              has. `col-span-full` drops it onto its own row under the
              controls it belongs to. */}
          {overlapsPerSlot[index]?.map((conflict) => (
            <div
              key={`${conflict.subjectName ?? 'self'}-${conflict.dayOfWeek}-${conflict.startMinutes}-${conflict.endMinutes}`}
              role="status"
              className="col-span-full flex items-center gap-2 rounded-md border border-warn bg-warn-soft px-3 py-2"
            >
              <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
              <span className="text-caption font-semibold text-warn">
                {t(conflict.subjectName === null ? 'slotEditor.overlapWithOwnSlot' : 'slotEditor.overlapWithSubject', {
                  subject: conflict.subjectName,
                  day: dayLabel(conflict.dayOfWeek),
                  start: minutesToTime(conflict.startMinutes),
                  end: minutesToTime(conflict.endMinutes)
                })}
              </span>
            </div>
          ))}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addSlot} className="self-start">
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t('slotEditor.addSlot')}
      </Button>
    </div>
  )
}
