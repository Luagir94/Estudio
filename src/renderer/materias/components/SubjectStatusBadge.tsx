// Presentational (design nodes `gs3CM` / `U02xK`): the ESTADO badge.
//
// Shared by the list and the detail screens so a subject never reads as one
// state in one place and another somewhere else.
import type { SubjectStatus } from '../domain/subjectStatus'

const STATUS_LABELS: Record<SubjectStatus, string> = {
  cursando: 'Cursando',
  sinCerrar: 'Sin cerrar',
  aprobada: 'Aprobada',
  reprobada: 'Reprobada',
  standby: 'Final pendiente'
}

const STATUS_STYLES: Record<SubjectStatus, string> = {
  cursando: 'border-primary bg-sidebar-accent text-primary-ink',
  // Amber, not red: an unclosed subject is a QUESTION the app is asking, not
  // a failure. Red is reserved for reprobada.
  sinCerrar: 'border-warn bg-warn-soft text-warn',
  aprobada: 'border-ok bg-ok-soft text-ok',
  reprobada: 'border-destructive bg-urgent-soft text-destructive',
  standby: 'border-primary bg-sidebar-accent text-primary-ink'
}

const DOT_STYLES: Record<SubjectStatus, string> = {
  cursando: 'bg-primary',
  sinCerrar: 'bg-warn',
  aprobada: 'bg-ok',
  reprobada: 'bg-destructive',
  standby: 'bg-primary'
}

interface SubjectStatusBadgeProps {
  status: SubjectStatus
}

export function SubjectStatusBadge({ status }: SubjectStatusBadgeProps): React.JSX.Element {
  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-md border px-2 py-1 text-caption font-semibold ${STATUS_STYLES[status]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  )
}

export { STATUS_LABELS }
