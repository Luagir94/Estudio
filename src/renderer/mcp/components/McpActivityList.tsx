// Presentational (approved `.pen`, design node `OZBa5` "Screen — Actividad
// MCP", card "Últimas operaciones", mcp-app-control task 18.3): renders the
// audit rows exactly in the order it receives them. Newest-first is the
// REPOSITORY's own contract (`sqliteMcpAuditRepository`, `mcp:listActivity`,
// spec "Activity trail is visible in-app, newest first") — this component
// has no ordering logic of its own to get wrong.
//
// No data fetching, no IPC here — that lives in `ActividadMcpContainer`.
import {
  Activity,
  Award,
  BookOpen,
  Calendar,
  CalendarDays,
  Check,
  CircleAlert,
  ClipboardList,
  FilePen,
  GraduationCap,
  History,
  Lock,
  ShieldX,
  Users,
  type LucideIcon
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import {
  describeMcpAuditOutcome,
  type McpAuditEntry,
  type McpAuditOutcome,
  type McpOutcomeTone
} from '../domain/mcpAuditEntry'
import { cn } from '../../shared/lib/cn'

// Same 8 icons the Permisos card already assigns to each slice (approved
// `.pen`, `McpPermissionsCard.tsx`'s `PERMISSION_ROWS`) — a row here names
// one of those SAME curated slices, or carries no slice at all for a
// rejected handshake (`auth-failed`, `entry.slice === null`), which falls
// back to a generic icon below rather than guessing a slice that was never
// dispatched.
const SLICE_ICONS: Record<string, LucideIcon> = {
  materias: BookOpen,
  carreras: GraduationCap,
  entregas: ClipboardList,
  fechas: Calendar,
  parciales: FilePen,
  finales: Award,
  clases: Users,
  horario: CalendarDays
}

// `entry.outcome` already comes in Zod-validated against the closed enum by
// `mcpActivityApi.ts`'s `listActivity` — unlike `describeMcpAuditOutcome`
// (which defends against a schema-ahead-of-renderer drift by accepting any
// `string`), this map can stay total over `McpAuditOutcome` with no runtime
// fallback branch to test.
const OUTCOME_ICONS: Record<McpAuditOutcome, LucideIcon> = {
  success: Check,
  denied: ShieldX,
  'auth-failed': Lock,
  invalid: CircleAlert,
  error: CircleAlert
}

// Presentational tone→Tailwind mapping, same `border-{tone} bg-{tone}-soft
// text-{tone}` convention `ConnectionStatusCard.tsx`'s `CHIP_STYLES`
// established for `ConnectionTone`.
const TONE_CLASSNAMES: Record<McpOutcomeTone, string> = {
  ok: 'border-ok bg-ok-soft text-ok',
  warn: 'border-warn bg-warn-soft text-warn',
  urgent: 'border-urgent bg-urgent-soft text-urgent'
}

interface McpActivityListProps {
  entries: McpAuditEntry[]
}

export function McpActivityList({ entries }: McpActivityListProps): React.JSX.Element {
  const { t } = useTranslation('mcp')

  if (entries.length === 0) {
    return <p className="text-body-lg text-muted-foreground">{t('mcpActivityScreen.empty')}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => {
        const display = describeMcpAuditOutcome(entry.outcome)
        const OutcomeIcon = OUTCOME_ICONS[entry.outcome]
        const SliceIcon = (entry.slice && SLICE_ICONS[entry.slice]) || Activity

        return (
          <div
            key={entry.id}
            data-testid="mcp-activity-row"
            className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
          >
            <SliceIcon className="h-[18px] w-[18px] shrink-0 text-secondary-foreground" aria-hidden="true" />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {/* `entry.tool` is `null` only for a rejected handshake — no tool
                  was ever dispatched (`shared/ipc/mcp.ts`'s own contract). */}
              <span className="truncate font-mono text-body-sm text-foreground">
                {entry.tool ?? t('mcpActivityScreen.noTool')}
              </span>
              <span className="truncate text-body-sm text-secondary-foreground">{entry.summary}</span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm font-semibold',
                  TONE_CLASSNAMES[display.tone]
                )}
              >
                <OutcomeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {display.label}
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-body-sm text-secondary-foreground">
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                {format(parseISO(entry.occurredAt), 'd MMM HH:mm', { locale: es })}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
