// Presentational (approved `.pen`, design node `J8kVj` "Card — Permisos
// MCP", mcp-app-control PR 16): same card shell and button conventions as
// `McpTokenCard.tsx` — these two cards sit next to each other on the Ajustes
// screen and must look like one person wrote both.
//
// No container, no react-query, no IPC here — same rule as every other card
// on this screen. `onChangePermission` always receives the SLICE'S FULL
// grant (both flags), because `mcp:setPermission` has no separate per-flag
// channel; toggling one flag reads the OTHER flag's current value from
// `permissions` and carries it through unchanged, so the two toggles behave
// as independent switches from the caller's point of view even though the
// wire call is not.
//
// Per-row toggle visibility comes from `MCP_SLICE_CAPABILITIES`
// (`shared/mcp/sliceCapabilities.ts`), the catalog-derived source of truth —
// NOT a hardcoded pair of booleans. Two slices show only one toggle per the
// approved design's own row copy (`clases`: write only; `horario`: read
// only); `parciales` and `finales` ALSO show only a write toggle, a finding
// from auditing the real tool catalog (`parcialesTools.ts`/`finalesTools.ts`
// expose no read tool) that the approved design's row prose does not call
// out. Rendering a toggle for a capability that grants nothing would be
// dishonest, so this card follows the catalog.
//
// The "Ver actividad" entry point (task 18.4): navigates to `/mcp/actividad`,
// the route PR18 registers. PR16 shipped this card with the button
// deliberately absent — a link to an unregistered route is a broken link
// shipped on purpose — and this is that gap closed, in the same head-right
// pill group the approved `.pen` always drew it in, beside the grant summary.
import {
  Award,
  BookOpen,
  Calendar,
  CalendarDays,
  ClipboardList,
  Eye,
  FilePen,
  GraduationCap,
  History,
  Pencil,
  Shield,
  ShieldCheck,
  TriangleAlert,
  Users
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { McpPermission } from '../../../shared/ipc/mcp'
import { MCP_SLICE_CAPABILITIES } from '../../../shared/mcp/sliceCapabilities'
import { cn } from '../../shared/lib/cn'
import { interactiveChip } from '../../shared/lib/interactive'

type McpSlice = McpPermission['slice']

interface PermissionRowConfig {
  slice: McpSlice
  icon: typeof BookOpen
}

// Approved `.pen` row order.
const PERMISSION_ROWS: PermissionRowConfig[] = [
  { slice: 'materias', icon: BookOpen },
  { slice: 'carreras', icon: GraduationCap },
  { slice: 'entregas', icon: ClipboardList },
  { slice: 'fechas', icon: Calendar },
  { slice: 'parciales', icon: FilePen },
  { slice: 'finales', icon: Award },
  { slice: 'clases', icon: Users },
  // `clock` does not exist in this app's lucide set (approved design's own
  // note) — `calendar-days` is the disclosed substitute, same as every other
  // timestamp-adjacent icon in this change.
  { slice: 'horario', icon: CalendarDays }
]

interface McpPermissionsCardProps {
  /** One entry per curated slice (contract guarantee — never only the granted ones). */
  permissions: McpPermission[]
  onChangePermission: (input: { slice: McpSlice; canRead: boolean; canWrite: boolean }) => void
  /** The slice whose `setPermission` mutation is in flight, or `null`. Disables only that row. */
  pendingSlice: McpSlice | null
  /** Navigates to `/mcp/actividad` (task 18.4). */
  onViewActivity: () => void
}

function permissionFor(permissions: McpPermission[], slice: McpSlice): McpPermission {
  return permissions.find((p) => p.slice === slice) ?? { slice, canRead: false, canWrite: false }
}

export function McpPermissionsCard({
  permissions,
  onChangePermission,
  pendingSlice,
  onViewActivity
}: McpPermissionsCardProps): React.JSX.Element {
  const { t } = useTranslation('mcp')

  const grantedCount = PERMISSION_ROWS.filter((row) => {
    const p = permissionFor(permissions, row.slice)
    return p.canRead || p.canWrite
  }).length

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card px-5 py-3.5">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-[18px] w-[18px] shrink-0 text-secondary-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <h3 className="text-body-lg font-semibold text-foreground">{t('mcpPermissionsCard.title')}</h3>
            <p className="text-body-sm text-secondary-foreground">{t('mcpPermissionsCard.description')}</p>
          </div>
        </div>

        {/* `$surface-sunken` group holding the grant summary AND (task 18.4)
            "Ver actividad", exactly as the approved `.pen` always drew it. */}
        <div className="flex shrink-0 items-center gap-2 rounded-lg bg-muted px-1 py-1">
          <div className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-body-sm font-semibold text-foreground">
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            {t('mcpPermissionsCard.summary', { count: grantedCount })}
          </div>
          <button
            type="button"
            onClick={onViewActivity}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-body-sm font-semibold text-foreground',
              interactiveChip
            )}
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            {t('mcpPermissionsCard.viewActivity')}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {PERMISSION_ROWS.map(({ slice, icon: Icon }) => {
          const capability = MCP_SLICE_CAPABILITIES[slice]
          const grant = permissionFor(permissions, slice)
          const isPending = pendingSlice === slice
          const name = t(`mcpPermissionsCard.rows.${slice}.name`)

          return (
            <div key={slice} role="group" aria-label={name} className="flex w-full items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Icon className="h-[18px] w-[18px] shrink-0 text-secondary-foreground" aria-hidden="true" />
                <div className="flex flex-col gap-0.5">
                  <p className="text-body-lg font-semibold text-foreground">{name}</p>
                  <p className="text-body-sm text-secondary-foreground">
                    {t(`mcpPermissionsCard.rows.${slice}.description`)}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {capability.hasRead && (
                  <PermissionToggle
                    active={grant.canRead}
                    icon={Eye}
                    label={t('mcpPermissionsCard.toggles.read')}
                    disabled={isPending}
                    onClick={() => onChangePermission({ slice, canRead: !grant.canRead, canWrite: grant.canWrite })}
                  />
                )}
                {capability.hasWrite && (
                  <PermissionToggle
                    active={grant.canWrite}
                    icon={Pencil}
                    label={t('mcpPermissionsCard.toggles.write')}
                    disabled={isPending}
                    onClick={() => onChangePermission({ slice, canRead: grant.canRead, canWrite: !grant.canWrite })}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
        <p className="text-body-sm font-medium text-warn">{t('mcpPermissionsCard.warning')}</p>
      </div>
    </div>
  )
}

interface PermissionToggleProps {
  active: boolean
  icon: typeof Eye
  label: string
  disabled: boolean
  onClick: () => void
}

// Design's own ON/OFF pair: ON fills `$surface`/strokes `$border`, ink is
// `$text-primary` at weight 600; OFF has no fill, no stroke, icon is
// `$text-muted`, label is `$text-secondary` at normal weight — hence the
// mismatched icon/label colour when OFF, not a typo.
function PermissionToggle({ active, icon: Icon, label, disabled, onClick }: PermissionToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm disabled:cursor-not-allowed disabled:opacity-60',
        active ? 'border-border bg-card font-semibold' : 'border-transparent font-normal',
        interactiveChip
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', active ? 'text-foreground' : 'text-muted-foreground')} aria-hidden="true" />
      <span className={active ? 'text-foreground' : 'text-secondary-foreground'}>{label}</span>
    </button>
  )
}
