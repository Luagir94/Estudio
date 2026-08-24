// Presentational, shared across "Nueva materia" (slice 2a) and "Editar
// materia" (slice 2b): a fully controlled schedule-slot list editor. It
// emits `slots[]` via onChange and persists nothing itself (design §4).
import type { ChangeEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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

export function SlotEditor({ value, onChange }: SlotEditorProps): React.JSX.Element {
  const { t } = useTranslation('common')
  const weekdayLabels = t('weekdaysLong', { returnObjects: true }) as string[]

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
        // eslint-disable-next-line react/no-array-index-key -- slots have no stable id until persisted
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
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addSlot} className="self-start">
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t('slotEditor.addSlot')}
      </Button>
    </div>
  )
}
