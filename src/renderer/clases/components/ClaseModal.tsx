// Presentational form (approved design): ONE surface per `(materia, fecha)`.
//
// The pair is the whole model — there is no stored "class session" row to
// edit, so this dialog is not a record editor, it is the two things you can
// say about a day: whether you were there, and what was given. Both are
// written by one "Guardar clase", which is what makes this a single surface
// instead of a mark widget plus a notes screen.
//
// Reached from two places, and it is the same dialog in both: a ClassRow's
// apunte button in Hoy, and an APUNTES DE CLASE row in the subject detail.
//
// Molded on `NuevoParcialModal` (header + body + footer sections, segmented
// control as a fieldset, effect callout, footer note that yields to a
// failure) and on `EditarMateriaModal`'s NOTAS field for the textarea.
import { zodResolver } from '@hookform/resolvers/zod'
import { Percent } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { CLASS_NOTE_BODY_MAX_CHARS } from '../../../shared/ipc/clases'
import type { AttendanceStatus } from '../../../shared/ipc/materias'
import { formatClassDateLong } from '../domain/classDate'
import type { ClassSlotLike } from '../domain/classOccurrence'
import { Button } from '../../shared/components/ui/button'
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay } from '../../shared/components/ui/dialog'
import { Label } from '../../shared/components/ui/label'
import { Textarea } from '../../shared/components/ui/textarea'
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'
import { translateValidationMessage } from '../../shared/lib/translateValidationMessage'

// Deliberately NOT `saveClassNoteInputSchema.omit(...)`, unlike the parcial
// form's reuse of its command schema: the command refuses an empty body
// because an emptied apunte is a DELETED apunte, and it is this dialog that
// makes that call (`clases:deleteNote`). What the two must agree on is the
// CAP, and they do — one exported constant, no second copy of the number.
const noteFormSchema = z.object({
  body: z.string().max(CLASS_NOTE_BODY_MAX_CHARS, 'body.tooLong')
})

// Order fixed here; the labels live in the catalog.
const STATUSES: AttendanceStatus[] = ['presente', 'ausente', 'feriado']

const NOTE_FIELD_ID = 'clase-modal-note'

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const mins = (minutes % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

/**
 * "Sistemas Operativos · 08:00 – 09:30 · Aula 204", assembled from whatever is
 * actually known.
 *
 * Composed here rather than in the catalog on purpose: the parts are
 * independently absent (an unresolvable occurrence takes the time AND the
 * aula; a slot with no location takes only the aula), and four catalog
 * variants of one line would be four strings to keep in step. The " · " is
 * punctuation between facts, not copy.
 */
function buildSubtitle(subjectName: string, occurrence: ClassSlotLike | null): string {
  const parts = [subjectName]
  if (occurrence !== null) {
    parts.push(`${formatTime(occurrence.startMinutes)} – ${formatTime(occurrence.endMinutes)}`)
    if (occurrence.location !== null) {
      parts.push(occurrence.location)
    }
  }
  return parts.join(' · ')
}

export interface ClaseFormValues {
  /** `null` = leave the class UNMARKED, which the container turns into `clases:clearAttendance`. */
  status: AttendanceStatus | null
  /** Empty = no apunte, which the container turns into `clases:deleteNote`. */
  body: string
}

interface ClaseModalProps {
  subjectName: string
  /** Local calendar date, `YYYY-MM-DD` — the class this dialog is about. */
  date: string
  /**
   * The slot this date falls on, already resolved from the weekly pattern by
   * `resolveClassOccurrence`. `null` when the horario no longer covers the
   * date: the mark and the apunte still exist (they are anchored to the day),
   * so the dialog stays fully usable and simply does not claim a time.
   */
  occurrence: ClassSlotLike | null
  attendanceStatus: AttendanceStatus | null
  /** The stored apunte, or '' when the class has none. */
  noteBody: string
  /**
   * Why the last save did not go through. Already app-owned Spanish copy
   * (`shared/lib/ipcErrorCopy.ts`) — never the raw IPC message.
   */
  error?: string | null
  /** True while a write is in flight — the submit locks so one class cannot be saved twice. */
  pending?: boolean
  onSubmit: (values: ClaseFormValues) => void
  onClose: () => void
}

export function ClaseModal({
  subjectName,
  date,
  occurrence,
  attendanceStatus,
  noteBody,
  error,
  pending,
  onSubmit,
  onClose
}: ClaseModalProps): React.JSX.Element {
  const { t } = useTranslation('clases')
  // The mark is not a form FIELD — it is three buttons with no input behind
  // them — so it is plain state rather than a `Controller`. The textarea is
  // the only thing the resolver has to validate.
  const [status, setStatus] = useState<AttendanceStatus | null>(attendanceStatus)
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({ resolver: zodResolver(noteFormSchema), defaultValues: { body: noteBody } })

  const title = t('claseModal.title', { date: formatClassDateLong(date) })

  return (
    <DialogOverlay>
      <DialogContent role="dialog" aria-label={title} onDismiss={onClose}>
        <DialogHeader onClose={onClose}>
          <h2 className="font-display text-title font-bold text-foreground">{title}</h2>
          <p className="text-body-sm text-muted-foreground">{buildSubtitle(subjectName, occurrence)}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit((values) => onSubmit({ status, body: values.body }))} className="contents">
          <DialogBody>
            {/* A fieldset, not a `Label`: this control is three buttons, and a
                `<label>` can only point at one of them — it would take the
                first button's accessible name with it. The legend borrows
                Label's own classes so the field still reads as a pair. */}
            <fieldset className="flex flex-col">
              <legend className="mb-1 block text-label font-semibold text-secondary-foreground">
                {t('claseModal.attendance')}
              </legend>
              <div className="flex w-fit gap-1 rounded-lg border border-border bg-background p-1">
                {STATUSES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={status === value}
                    // Pressing the ACTIVE option clears the mark, the same
                    // toggle contract the ClassRow pair has. There is
                    // deliberately no fourth "Sin marcar" segment: unmarked is
                    // the absence of a mark, and drawing it as an option would
                    // make it look like a fourth thing you can record.
                    onClick={() => setStatus(status === value ? null : value)}
                    className={cn(
                      'rounded-md px-3 py-2 text-body-sm font-semibold',
                      status === value ? 'bg-primary text-primary-foreground' : 'text-secondary-foreground',
                      interactiveChip
                    )}
                  >
                    {t(`claseModal.attendanceOptions.${value}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col">
              <div className="flex items-baseline justify-between gap-4">
                {/* `htmlFor` rather than nesting: the hint sits on the same
                    line as the label, outside it, so the pair cannot be one
                    wrapping element. */}
                <Label htmlFor={NOTE_FIELD_ID}>{t('claseModal.note')}</Label>
                <span className="text-body-sm text-muted-foreground">{t('claseModal.noteHint')}</span>
              </div>
              <Textarea
                id={NOTE_FIELD_ID}
                placeholder={t('claseModal.notePlaceholder')}
                className="min-h-28"
                {...register('body')}
              />
            </div>
            {errors.body && (
              <p className="text-body-lg text-destructive">{translateValidationMessage(t, errors.body.message)}</p>
            )}

            <div className="flex items-start gap-3 rounded-lg border border-primary bg-sidebar-accent px-4 py-3">
              <Percent className="mt-px h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
              <p className="text-caption leading-relaxed text-secondary-foreground">{t('claseModal.effectNote')}</p>
            </div>
          </DialogBody>

          <DialogFooter className="justify-between">
            {/* The failure takes the footer-note slot (same as the parcial and
                final dialogs): a note about what you CAN do is noise while the
                form is telling you what just did not happen. */}
            {error ? (
              <p className="text-caption text-destructive">{error}</p>
            ) : (
              <p className="text-caption text-muted-foreground">{t('claseModal.footerNote')}</p>
            )}
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={pending}>
                {t('claseModal.submit')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogOverlay>
  )
}
