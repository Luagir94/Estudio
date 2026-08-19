// Presentational (design §4, node `G07yA` — ClassRow: Time Block [start/end,
// 15/13px] + Subject Bar [3px, subject color] + Class Info [subject name] +
// Room. Read-only — Hoy has "sin acciones primarias" (design node `VQJO4`'s
// own description), so unlike Horario's class blocks this row has no click
// handler.
//
// Disclosed deviation: the design's "Class Meta" line (e.g. "Teórica",
// "Laboratorio") has no backing field on `schedule_slots` — only
// dayOfWeek/startMinutes/endMinutes/location are persisted. Omitted rather
// than inventing a class-type value (zero new persisted fields).

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const mins = (minutes % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

interface ClassRowProps {
  subjectName: string
  subjectColor: string
  startMinutes: number
  endMinutes: number
  location: string | null
}

export function ClassRow({
  subjectName,
  subjectColor,
  startMinutes,
  endMinutes,
  location
}: ClassRowProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex w-[52px] shrink-0 flex-col gap-1">
        <span className="text-body-lg font-semibold text-foreground">{formatTime(startMinutes)}</span>
        <span className="text-body-sm text-muted-foreground">{formatTime(endMinutes)}</span>
      </div>

      <span
        aria-hidden="true"
        style={{ backgroundColor: subjectColor }}
        className="h-9 w-[3px] shrink-0 rounded-full"
      />

      <span className="flex-1 text-body-lg font-semibold text-foreground">{subjectName}</span>

      {location && <span className="shrink-0 text-body-sm text-secondary-foreground">{location}</span>}
    </div>
  )
}
