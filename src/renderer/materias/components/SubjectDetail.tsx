// Presentational, READ-ONLY (design §4, node `TYFvB` — verified via the
// Pencil MCP tools; spec "Read-Model Only Detail View"): this screen carries
// exactly three write affordances — the "Editar materia" button (`onEdit`),
// the "Cerrar materia" button (`onCloseSubject`) and the ENTREGAS section
// header's "Agregar entrega" button (`onAddEntrega`, amendment 8, design node
// `l4Wr1F`) — plus the back link (`onBack`); every field here is otherwise
// non-editable, and campusUrl is opened via `onOpenCampusUrl` (backed by
// `api.app.openExternal`), never a raw `<a href>`.
//
// Design is a TWO-COLUMN layout: left column = horario semanal / entregas /
// notas, right column = próxima clase / progreso / stats / cátedra. The
// "ENTREGAS" list renders `subject.deadlines` — real data already fetched
// by `materias:detail` (used before this pass only for the progreso count),
// not a fabricated list; status pills are computed from the real `dueAt`/
// `done` fields, never invented.
import { ChevronLeft, CircleCheck, ExternalLink, MapPin, Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toMondayFirstIndex } from '../../shared/domain/dayOfWeek'
// Deadline status wording is owned by the entregas domain. This screen used to
// hand-roll its own copy, which drifted ("Vencida" here vs "N días de atraso"
// on Entregas) — one formatter, one source of truth.
import { classifyUrgency, formatDeadlineStatus } from '../../entregas/domain/deadline'
import type { DeadlineUrgency } from '../../entregas/domain/deadline'
import type { SubjectDetailResult } from '../../../shared/ipc/materias'
import { Button } from '../../shared/components/ui/button'
import { cn } from '../../shared/lib/cn'
import { interactiveGhost, interactiveLink } from '../../shared/lib/interactive'
import { subjectColorForScheme } from '../../shared/lib/subjectColorScheme'
import { usePrefersLightScheme } from '../../shared/lib/usePrefersLightScheme'

interface SubjectDetailProps {
  subject: SubjectDetailResult
  /** Próxima clase — null when the subject has no schedule slots. */
  nextClass: Date | null
  progreso: { done: number; total: number }
  /** Horas/semana, expressed as total minutes (design §3a: domain computes minutes, this formats). */
  weeklyMinutes: number
  /** Reference instant for "Próxima clase" and entrega due-date formatting. Defaults to the real clock. */
  now?: Date
  onOpenCampusUrl: (url: string) => void
  onBack: () => void
  onEdit: () => void
  /** Opens deadline creation, fixed to this subject (amendment 8 — the ONLY entry point for creating a deadline). */
  onAddEntrega: () => void
  /**
   * Opens the "Cerrar materia" form — the ONLY entry point for recording an
   * outcome (aprobada / reprobada / final pendiente). Offered whatever the
   * período's dates say: the student's decision wins over the calendar, and
   * a promoción closes a subject while its período is still running.
   */
  onCloseSubject: () => void
  /**
   * Injection point for the ADJUNTOS section (design: left column,
   * immediately after NOTAS). `AdjuntosContainer` owns its own data fetching
   * and IPC — this presentational component only reserves its slot, the same
   * way `SubjectDetailContainer` composes other cross-domain containers
   * (`FinalesContainer`) without this component importing them directly.
   */
  adjuntosSlot?: React.ReactNode
}

// Violet is reserved for interaction (Pencil design) — a status pill must
// never borrow the accent, so pending urgency grades urgent → warn → neutral.
// Same mapping as the Entregas and Hoy DeadlineRows.
const urgencyPillClassNames: Record<DeadlineUrgency, string> = {
  overdue: 'bg-(--color-urgent-soft) text-(--color-urgent)',
  imminent: 'bg-(--color-warn-soft) text-(--color-warn)',
  thisWeek: 'bg-(--color-surface-sunken) text-(--color-ink-secondary)',
  later: 'bg-(--color-surface-sunken) text-(--color-ink-muted)'
}

function statusPillClassName(dueAt: string, done: boolean, now: Date): string {
  if (done) {
    return 'bg-muted text-muted-foreground'
  }
  return urgencyPillClassNames[classifyUrgency(dueAt, now)]
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const mins = (minutes % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

// Number part only — the "{{value}} h" wrapping is the locale's business.
function formatWeeklyHoursValue(totalMinutes: number): string {
  const hours = totalMinutes / 60
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
}

function formatNextClass(nextClass: Date, weekdayLabels: string[]): string {
  const dayLabel = weekdayLabels[toMondayFirstIndex(nextClass.getDay())]
  const hours = nextClass.getHours().toString().padStart(2, '0')
  const minutes = nextClass.getMinutes().toString().padStart(2, '0')
  return `${dayLabel} ${hours}:${minutes}`
}

export function SubjectDetail({
  subject,
  nextClass,
  progreso,
  weeklyMinutes,
  now = new Date(),
  onOpenCampusUrl,
  onBack,
  onEdit,
  onAddEntrega,
  onCloseSubject,
  adjuntosSlot
}: SubjectDetailProps): React.JSX.Element {
  const { t } = useTranslation('materias')
  // Stored subject colours are the dark palette; inline styles cannot hear
  // the light media query, so the scheme mapping happens here.
  const scheme = usePrefersLightScheme() ? 'light' : 'dark'
  // Monday-first, same order as `toMondayFirstIndex` produces.
  const weekdayLabels = t('common:weekdaysLong', { returnObjects: true }) as string[]
  const monthLabels = t('common:monthsCaps', { returnObjects: true }) as string[]
  const orderedSlots = [...subject.slots].sort(
    (a, b) => toMondayFirstIndex(a.dayOfWeek) - toMondayFirstIndex(b.dayOfWeek)
  )
  const orderedDeadlines = [...subject.deadlines].sort(
    (a, b) => Number(a.done) - Number(b.done) || a.dueAt.localeCompare(b.dueAt)
  )
  const pending = progreso.total - progreso.done
  const progressPercent = progreso.total === 0 ? 0 : Math.round((progreso.done / progreso.total) * 100)

  return (
    <section aria-label={t('subjectDetail.detailLabel', { name: subject.name })} className="flex flex-col gap-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="w-fit gap-2 px-0 text-secondary-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        {t('subjectDetail.backToList')}
      </Button>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            style={{ backgroundColor: subjectColorForScheme(subject.color, scheme) }}
            className="h-[46px] w-1 shrink-0 rounded-sm"
          />
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-display-lg font-bold text-foreground">{subject.name}</h2>
            <div className="flex items-center gap-2 text-body-sm">
              <span className="font-medium text-muted-foreground">{subject.code}</span>
              <span aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-muted-foreground" />
              <span className="text-secondary-foreground">
                {subject.attendanceMinPercent !== null
                  ? t('subjectDetail.attendanceRequired', { percent: subject.attendanceMinPercent })
                  : t('subjectDetail.attendanceFree')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onEdit} className="gap-2 bg-card">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {t('subjectDetail.editSubject')}
          </Button>
          <Button type="button" onClick={onCloseSubject} className="gap-2">
            <CircleCheck className="h-3.5 w-3.5" aria-hidden />
            {t('subjectDetail.closeSubject')}
          </Button>
        </div>
      </header>

      {/* The right rail is a SIDE panel only while there is a side to put it
          on. Below `xl` it becomes the bottom of the page — stacked, full
          width — instead of a 336px column squeezing the schedule next to it. */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-3">
            <h3 className="text-label font-semibold text-muted-foreground">
              {t('subjectDetail.weeklyScheduleHeading')}
            </h3>
            {orderedSlots.length === 0 && (
              <p className="text-body-lg text-muted-foreground">{t('subjectDetail.noSlots')}</p>
            )}
            {orderedSlots.map((slot) => (
              <div
                key={slot.id}
                data-testid="subject-detail-slot"
                className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
              >
                <span className="text-body font-semibold text-foreground">
                  {weekdayLabels[toMondayFirstIndex(slot.dayOfWeek)]}
                </span>
                <span className="text-body text-secondary-foreground">
                  {formatTime(slot.startMinutes)} – {formatTime(slot.endMinutes)}
                </span>
                <span className="flex-1" />
                {slot.location && (
                  <span className="flex items-center gap-1 text-body-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {slot.location}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-label font-semibold text-muted-foreground">{t('subjectDetail.deadlinesHeading')}</h3>
              <Button type="button" onClick={onAddEntrega} className="gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('subjectDetail.addDeadline')}
              </Button>
            </div>
            {orderedDeadlines.length === 0 && (
              <p className="text-body-lg text-muted-foreground">{t('subjectDetail.noDeadlines')}</p>
            )}
            {orderedDeadlines.map((deadline) => {
              const dueDate = new Date(deadline.dueAt)
              return (
                <div
                  key={deadline.id}
                  data-testid="subject-detail-deadline"
                  className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="flex w-11 shrink-0 flex-col items-center gap-1 rounded-lg bg-muted py-2">
                    {/* Day numeral in the display face (type consolidation
                        pass) — the chip's month label stays in the UI face. */}
                    <span
                      className={`font-display text-body-lg font-semibold ${deadline.done ? 'text-muted-foreground' : 'text-foreground'}`}
                    >
                      {dueDate.getDate().toString().padStart(2, '0')}
                    </span>
                    <span className="text-overline font-semibold text-muted-foreground">
                      {monthLabels[dueDate.getMonth()]}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <span
                      className={`text-body-lg font-semibold ${deadline.done ? 'text-muted-foreground' : 'text-foreground'}`}
                    >
                      {deadline.title}
                    </span>
                    <span className="flex items-center gap-2 text-body-sm text-secondary-foreground">
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: subjectColorForScheme(subject.color, scheme) }}
                        className="h-[7px] w-[7px] rounded-full"
                      />
                      {subject.name}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-caption font-semibold ${statusPillClassName(
                      deadline.dueAt,
                      deadline.done,
                      now
                    )}`}
                  >
                    {formatDeadlineStatus(deadline.dueAt, deadline.done, now)}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-label font-semibold text-muted-foreground">{t('subjectDetail.notesHeading')}</h3>
              <button
                type="button"
                onClick={onEdit}
                className={cn(
                  '-m-1 flex items-center gap-1 rounded-md p-1 text-label font-medium text-muted-foreground',
                  interactiveGhost
                )}
              >
                <Pencil className="h-3 w-3" aria-hidden />
                {t('subjectDetail.editNotes')}
              </button>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              {subject.notas ? (
                <dl>
                  <dd
                    data-testid="subject-detail-notas"
                    className="text-body-sm leading-[1.55] text-secondary-foreground"
                  >
                    {subject.notas}
                  </dd>
                </dl>
              ) : (
                <p className="text-body-sm text-muted-foreground">{t('subjectDetail.noNotes')}</p>
              )}
            </div>
          </div>

          {adjuntosSlot}
        </div>

        <div className="flex w-full flex-col gap-4 xl:w-[336px] xl:shrink-0">
          <div className="flex flex-col gap-2 rounded-xl border border-primary bg-(--color-violet-soft) p-4">
            <span className="text-overline font-semibold text-primary-ink">{t('subjectDetail.nextClassHeading')}</span>
            {nextClass ? (
              <>
                {/* Next-class time in the display face (type consolidation pass). */}
                <span className="font-display text-heading font-bold text-foreground">
                  {formatNextClass(nextClass, weekdayLabels)}
                </span>
                <span className="text-body-sm text-secondary-foreground">
                  {subject.slots.find(
                    (slot) => toMondayFirstIndex(slot.dayOfWeek) === toMondayFirstIndex(nextClass.getDay())
                  )?.location ?? t('subjectDetail.noClassroom')}
                </span>
              </>
            ) : (
              <span className="text-body-lg font-medium text-secondary-foreground">
                {t('subjectDetail.noScheduledClasses')}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-overline font-semibold text-muted-foreground">
                {t('subjectDetail.progressHeading')}
              </span>
              <span className="text-body-sm font-semibold text-foreground">
                {t('subjectDetail.progressCount', { done: progreso.done, total: progreso.total })}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-label text-muted-foreground">
              {progreso.total === 0
                ? t('subjectDetail.noDeadlinesRecorded')
                : `${t('subjectDetail.pendingCount', { count: pending })} · ${t('subjectDetail.completedCount', { count: progreso.done })}`}
            </span>
          </div>

          <div className="flex flex-col rounded-xl border border-border bg-card px-4 py-1">
            <div className="flex items-center justify-between border-b border-border py-3 last:border-b-0">
              <span className="text-body-sm text-secondary-foreground">{t('subjectDetail.hoursPerWeek')}</span>
              <span className="text-body-sm font-semibold text-foreground">
                {t('subjectDetail.weeklyHours', { value: formatWeeklyHoursValue(weeklyMinutes) })}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-border py-3 last:border-b-0">
              <span className="text-body-sm text-secondary-foreground">{t('subjectDetail.classesPerWeek')}</span>
              <span className="text-body-sm font-semibold text-foreground">{subject.slots.length}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-body-sm text-secondary-foreground">{t('subjectDetail.minAttendance')}</span>
              <span className="text-body-sm font-semibold text-foreground">
                {subject.attendanceMinPercent !== null
                  ? `${subject.attendanceMinPercent}%`
                  : t('subjectDetail.minAttendanceFree')}
              </span>
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-border bg-card px-4 py-1">
            <div className="flex items-center justify-between border-b border-border py-3 last:border-b-0">
              <span className="text-body-sm text-secondary-foreground">{t('subjectDetail.teacher')}</span>
              <span className="text-body-sm font-semibold text-foreground">{subject.docente ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border py-3 last:border-b-0">
              <span className="text-body-sm text-secondary-foreground">{t('subjectDetail.contact')}</span>
              <span className="text-body-sm font-semibold text-foreground">{subject.contacto ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-body-sm text-secondary-foreground">{t('subjectDetail.campus')}</span>
              {subject.campusUrl ? (
                <button
                  type="button"
                  aria-label={t('subjectDetail.openCampus')}
                  onClick={() => onOpenCampusUrl(subject.campusUrl as string)}
                  className={cn('flex items-center gap-1 text-body-sm font-semibold text-primary-ink', interactiveLink)}
                >
                  {t('subjectDetail.virtualClassroom')}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </button>
              ) : (
                <span className="text-body-sm font-semibold text-foreground">—</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
