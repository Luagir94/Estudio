// Presentational (design §4, node `G07yA` — ClassRow: Time Block [start/end,
// 15/13px] + Subject Bar [3px, subject color] + Class Info [subject name] +
// Room + the three class-mark controls).
//
// This row used to be read-only, on the old rule that "Hoy has sin acciones
// primarias". The approved design ends that rule deliberately: the day's own
// list is where you actually know whether you were in the class, so marking it
// belongs here and nowhere else. The controls are the ONLY write affordance
// Hoy has, and they still write through `clases:*` — this component holds no
// IPC, only callbacks.
//
// Disclosed deviation: the design's "Class Meta" line (e.g. "Teórica",
// "Laboratorio") has no backing field on `schedule_slots` — only
// dayOfWeek/startMinutes/endMinutes/location are persisted. Omitted rather
// than inventing a class-type value (zero new persisted fields). The
// "next class" pill the design hangs on that meta line therefore sits next
// to the subject name instead.
import type { TFunction } from 'i18next'
import { Check, NotebookPen, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AttendanceStatus } from '../../../shared/ipc/materias'
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'
import { subjectColorForScheme } from '../../shared/lib/subjectColorScheme'
import { usePrefersLightScheme } from '../../shared/lib/usePrefersLightScheme'

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const mins = (minutes % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

/** Pill copy: "Ahora" in progress, minutes under an hour, "h"/"h min" from there up — uppercased by CSS, never in the string. */
function formatStartsIn(t: TFunction, minutesUntilStart: number): string {
  if (minutesUntilStart <= 0) {
    return t('classRow.inProgress')
  }
  const hours = Math.floor(minutesUntilStart / 60)
  const minutes = minutesUntilStart % 60
  if (hours === 0) {
    return t('classRow.startsInMinutes', { minutes })
  }
  return minutes === 0 ? t('classRow.startsInHours', { hours }) : t('classRow.startsInHoursMinutes', { hours, minutes })
}

// 30×30, radius 8, 14px icon (approved design). The UNSET tone is the sunken
// surface with secondary ink; each active tone is a soft fill with its own
// ink. `interactiveChip` rather than `interactiveSurface` for the same reason
// every other selectable control uses it: these carry a painted selected
// state, and a hover FILL would repaint it into looking unselected.
const CONTROL_BASE = 'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg'
const CONTROL_UNSET = 'bg-muted text-secondary-foreground'

interface ClassRowProps {
  subjectName: string
  subjectColor: string
  startMinutes: number
  endMinutes: number
  location: string | null
  /**
   * Set only on the day's highlighted "next class" (see
   * `getNextClassHighlight`'s in-progress-first rule): minutes until it
   * starts, 0/negative while in progress. `null`/omitted renders the plain
   * surface row.
   */
  minutesUntilStart?: number | null
  /** `null` = UNMARKED, which is the absence of a stored row and not a fourth status. */
  attendanceStatus: AttendanceStatus | null
  /** Whether this class already carries an apunte — the control's accent tone is the only place it shows on this row. */
  hasNote: boolean
  /**
   * `null` clears the mark back to unmarked. The two toggles are a PAIR:
   * clicking the active one is how you undo a mis-click, and there is no
   * separate "borrar" affordance to find.
   */
  onMarkAttendance: (status: AttendanceStatus | null) => void
  /** Opens the class (asistencia + apunte) for this row's date. */
  onOpenClase: () => void
}

export function ClassRow({
  subjectName,
  subjectColor,
  startMinutes,
  endMinutes,
  location,
  minutesUntilStart = null,
  attendanceStatus,
  hasNote,
  onMarkAttendance,
  onOpenClase
}: ClassRowProps): React.JSX.Element {
  const { t } = useTranslation('hoy')
  const { t: tc } = useTranslation('clases')
  // Stored subject colours are the dark palette; inline styles cannot hear
  // the light media query, so the scheme mapping happens here.
  const scheme = usePrefersLightScheme() ? 'light' : 'dark'
  const isNextClass = minutesUntilStart !== null
  // A `feriado` leaves BOTH toggles unpressed: the class did not happen, so it
  // is neither attended nor missed (the same exclusion the percentage makes).
  // That state is set and cleared from the modal, which is where the third
  // option lives.
  const isPresente = attendanceStatus === 'presente'
  const isAusente = attendanceStatus === 'ausente'

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border bg-card px-4 py-3',
        // The accent border is the ONLY surface change — the row keeps its
        // card background so the highlight reads as an outline, not a fill.
        isNextClass ? 'border-violet' : 'border-border'
      )}
    >
      <div className="flex w-[52px] shrink-0 flex-col gap-1">
        <span className="text-body-lg font-semibold text-foreground">{formatTime(startMinutes)}</span>
        <span className="text-body-sm text-muted-foreground">{formatTime(endMinutes)}</span>
      </div>

      <span
        aria-hidden="true"
        style={{ backgroundColor: subjectColorForScheme(subjectColor, scheme) }}
        className="h-9 w-[3px] shrink-0 rounded-full"
      />

      <span className="flex flex-1 items-center gap-2">
        <span className="text-body-lg font-semibold text-foreground">{subjectName}</span>
        {isNextClass && (
          // `text-label` is the scale's 10px step WITH its 0.6px uppercase
          // tracking baked in — exactly the pill's spec, no ad-hoc sizing.
          <span className="shrink-0 rounded-full bg-violet-soft px-2 py-0.5 text-label font-semibold uppercase text-violet-ink">
            {formatStartsIn(t, minutesUntilStart)}
          </span>
        )}
      </span>

      {location && <span className="shrink-0 text-body-sm text-secondary-foreground">{location}</span>}

      {/* A fieldset, NOT a wrapping `Label`: a `<button>` is a labelable
          element, so a `<label>` around this pair would steal the accessible
          name of the first button and leave the second unnamed. Same reason
          the REGULARIDAD control in EditarMateriaModal is a fieldset. The
          legend is visually hidden because the approved row draws no group
          heading — each button already names its own subject. */}
      <fieldset className="flex shrink-0 items-center gap-1.5">
        <legend className="sr-only">{tc('classRow.attendanceGroup')}</legend>
        <button
          type="button"
          aria-pressed={isPresente}
          aria-label={tc('classRow.presente', { subject: subjectName })}
          onClick={() => onMarkAttendance(isPresente ? null : 'presente')}
          className={cn(
            CONTROL_BASE,
            isPresente ? 'bg-(--color-ok-soft) text-(--color-ok)' : CONTROL_UNSET,
            interactiveChip
          )}
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-pressed={isAusente}
          aria-label={tc('classRow.ausente', { subject: subjectName })}
          onClick={() => onMarkAttendance(isAusente ? null : 'ausente')}
          className={cn(
            CONTROL_BASE,
            isAusente ? 'bg-(--color-urgent-soft) text-(--color-urgent)' : CONTROL_UNSET,
            interactiveChip
          )}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </fieldset>

      {/* Outside the fieldset on purpose: this is not a third attendance
          option, it opens the class. Its accent tone is a STATE readout ("this
          class already has an apunte"), not a selection. */}
      <button
        type="button"
        aria-label={tc('classRow.apunte', { subject: subjectName })}
        onClick={onOpenClase}
        className={cn(CONTROL_BASE, hasNote ? 'bg-violet-soft text-primary-ink' : CONTROL_UNSET, interactiveChip)}
      >
        <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
