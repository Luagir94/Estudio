// The app's own data, rendered as text the model can read (design: global
// corpus). Attachments reach the CLI as FILES via `--add-dir`; everything
// else is SQLite rows, and they travel inside the prompt.
//
// THIS MODULE IS THE SEAM. When the app exposes an MCP server, Claude will
// query this data live through tools instead of receiving a dump, and the
// replacement is this file plus the service call that fills it — not the
// service's control flow, not the prompt builder, not the contract. Keep it
// pure and keep the shapes narrow so that stays true.
//
// `contacto` is deliberately NOT part of `AppContextSubject`: it is usually a
// professor's phone or email, which is a third party's personal data rather
// than the student's own. Everything here belongs to the student.

export interface AppContextSlot {
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
  location: string | null
}

export interface AppContextSubject {
  name: string
  code: string
  docente: string | null
  notas: string | null
  attendanceMinPercent: number | null
  slots: readonly AppContextSlot[]
}

export interface AppContextDeadline {
  title: string
  type: string
  dueAt: string
  done: boolean
  subjectName: string
}

export interface AppContextFinal {
  subjectName: string
  label: string
  /** `null` on purpose — a mesa can be recorded before its date is published. */
  takenOn: string | null
  result: string
}

export interface AppContextPeriod {
  programName: string
  name: string
  startsOn: string
  endsOn: string | null
}

export interface AppContext {
  subjects: readonly AppContextSubject[]
  deadlines: readonly AppContextDeadline[]
  finals: readonly AppContextFinal[]
  periods: readonly AppContextPeriod[]
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function formatSlot(slot: AppContextSlot): string {
  const day = DAYS[slot.dayOfWeek] ?? `día ${slot.dayOfWeek}`
  const range = `${formatMinutes(slot.startMinutes)}-${formatMinutes(slot.endMinutes)}`
  return slot.location ? `${day} ${range} (${slot.location})` : `${day} ${range}`
}

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [`${title}:`, ...lines, '']
}

/**
 * Renders the context as plain labelled lines rather than JSON. The model
 * reads this as reference material, and every line is written so the label it
 * would cite (`Horario · Derecho Romano`) is visible in the line itself.
 *
 * Returns an empty string when the app holds nothing, which is a valid state:
 * the caller still asks, and the answer comes back marked `general`.
 */
export function buildAppContext(context: AppContext): string {
  const lines: string[] = []

  lines.push(
    ...section(
      'MATERIAS',
      context.subjects.map((subject) => {
        const parts = [`- ${subject.name} (${subject.code})`]
        if (subject.docente) parts.push(`docente: ${subject.docente}`)
        if (subject.attendanceMinPercent !== null) parts.push(`asistencia mínima: ${subject.attendanceMinPercent}%`)
        if (subject.notas) parts.push(`notas: ${subject.notas}`)
        return parts.join(' · ')
      })
    )
  )

  lines.push(
    ...section(
      'HORARIO',
      context.subjects
        .filter((subject) => subject.slots.length > 0)
        .map((subject) => `- ${subject.name}: ${subject.slots.map(formatSlot).join(', ')}`)
    )
  )

  lines.push(
    ...section(
      'ENTREGAS',
      context.deadlines.map(
        (deadline) =>
          `- ${deadline.title} (${deadline.type}) · ${deadline.subjectName} · vence ${deadline.dueAt} · ${deadline.done ? 'hecha' : 'pendiente'}`
      )
    )
  )

  lines.push(
    ...section(
      'FINALES',
      context.finals.map(
        (final) =>
          `- ${final.subjectName} · ${final.label} · ${final.result}${final.takenOn ? ` · ${final.takenOn}` : ''}`
      )
    )
  )

  lines.push(
    ...section(
      'CARRERAS Y PERÍODOS',
      context.periods.map(
        (period) =>
          `- ${period.programName} · ${period.name} · ${period.startsOn}${period.endsOn ? ` a ${period.endsOn}` : ''}`
      )
    )
  )

  return lines.join('\n').trim()
}
