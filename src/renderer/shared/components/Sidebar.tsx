// Reusable Sidebar (design/course-companion.pen node `LczWA`, verified
// directly against the .pen file via the Pencil MCP tools during the
// UI-fidelity pass — the previous unit styled this from a text description
// in memory, without design access, and invented details: wrong title,
// missing subtitle/footer, wrong icons, and a "Próximamente" label the
// design never specifies).
//
// All four domains now have built screens — slice 5 flips Hoy, the last
// inert nav item, and wires the "Exportar datos" footer row to the real
// `app:exportJson` flow (see `onExport`).
//
// COLLAPSED STATE (design: component `Sidebar Rail` + grupo "Responsive").
// Collapsing is a real markup change, not a width animation: the labels stop
// being rendered text and become tooltips, so the rail keeps every nav item
// reachable at 64px. The accessible name is preserved with `sr-only` spans —
// a screen-reader user must not lose the label just because the window got
// narrow, and it also keeps `getByRole('button', { name: 'Hoy' })` valid in
// both states.
import {
  BookOpen,
  Calendar,
  CircleCheck,
  Download,
  GraduationCap,
  HardDrive,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun
} from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '../lib/cn'
import { interactive, interactiveGhost } from '../lib/interactive'

export type SidebarDomain = 'hoy' | 'materias' | 'horario' | 'entregas' | 'carreras' | 'ajustes'

interface SidebarProps {
  active: SidebarDomain
  /** Navigates to an available domain's screen. Only called for items with `available: true`. */
  onNavigate: (domain: SidebarDomain) => void
  /** Triggers the `app:exportJson` flow (spec: "Export from sidebar footer" — same flow as the native File menu). */
  onExport: () => void
  /** Rail mode: icons only, labels as tooltips. */
  collapsed: boolean
  /** Flips the user's collapse preference. */
  onToggleCollapsed: () => void
  /**
   * Every carrera+período being cursada today (design node `y0BCKe`).
   *
   * A LIST, not one entry, because the app has no concept of an active
   * carrera — there can be several at once and which one matters is the
   * user's call. So this line NAMES the term when there is exactly one and
   * COUNTS when there are more, borrowing the design's own idiom for the
   * plural case (`Select Período`'s "2 períodos activos"). It never picks a
   * winner, which would assert a "current carrera" the product does not have.
   *
   * Typed structurally instead of importing `ActiveTerm` from
   * `carreras/domain`: this component lives in `shared/`, and shared must not
   * learn a feature's vocabulary to print one string.
   *
   * The design puts a `chevrons-up-down` beside this line, i.e. a SWITCHER.
   * It is deliberately still not rendered: an affordance that promises a menu
   * and opens nothing is worse than no affordance at all.
   */
  terms?: { programName: string; periodName: string }[]
  /**
   * False when the window itself is too narrow for the expanded sidebar. The
   * toggle stays VISIBLE and explains itself rather than vanishing: a control
   * that disappears reads as a bug, one that is disabled reads as a rule.
   */
  canToggle?: boolean
}

interface NavItem {
  domain: SidebarDomain
  label: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  /** Set once the domain's screen is built (slices 4-5 will flip the rest). */
  available: boolean
}

const NAV_ITEMS: NavItem[] = [
  { domain: 'hoy', label: 'Hoy', icon: Sun, available: true },
  { domain: 'materias', label: 'Materias', icon: BookOpen, available: true },
  { domain: 'horario', label: 'Horario', icon: Calendar, available: true },
  { domain: 'entregas', label: 'Entregas', icon: CircleCheck, available: true },
  // Last on purpose (design node `wx0uR`): carreras is setup you touch a few
  // times a term, not a daily screen. The brand block's period switcher is
  // the frequent path into it.
  { domain: 'carreras', label: 'Carreras', icon: GraduationCap, available: true },
  // Sixth and final item (PR7, approved `.pen`): settings is the least
  // frequent screen in the app, so it sits after carreras, not before it.
  { domain: 'ajustes', label: 'Ajustes', icon: Settings, available: true }
]

export function Sidebar({
  active,
  onNavigate,
  onExport,
  collapsed,
  onToggleCollapsed,
  terms = [],
  canToggle = true
}: SidebarProps): React.JSX.Element {
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose
  const toggleLabel = collapsed ? 'Desplegar barra lateral' : 'Replegar barra lateral'
  const termLabel =
    terms.length === 0
      ? 'Sin período activo'
      : terms.length === 1
        ? `${terms[0].programName} · ${terms[0].periodName}`
        : `${terms.length} períodos activos`

  return (
    <nav
      aria-label="Navegación principal"
      data-collapsed={collapsed}
      className={cn(
        'flex h-full shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar py-6',
        collapsed ? 'w-16 px-3' : 'w-[232px] px-4'
      )}
    >
      <div className={cn('flex items-center gap-2', collapsed ? 'justify-center' : 'px-2')}>
        {!collapsed && (
          <div className="flex min-w-0 flex-1 flex-col gap-px">
            <p className="truncate font-display text-body-lg font-semibold text-sidebar-foreground">Mi Cursada</p>
            {/* Was the hardcoded string "2027 · Primer cuatrimestre", which
                named a cuatrimestre no row in the database had ever agreed
                to. Carrera first, then período, in the design's order. */}
            <p className="truncate text-caption font-medium text-muted-foreground">{termLabel}</p>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          disabled={!canToggle}
          aria-expanded={!collapsed}
          title={canToggle ? toggleLabel : 'La ventana es muy angosta para la barra completa'}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-secondary-foreground',
            interactive,
            'hover:text-foreground active:opacity-80 disabled:opacity-40'
          )}
        >
          <ToggleIcon className="h-4 w-4" aria-hidden />
          <span className="sr-only">{toggleLabel}</span>
        </button>
      </div>

      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ domain, label, icon: Icon, available }) => {
          const isActive = domain === active
          const itemClassName = cn(
            'flex w-full items-center rounded-lg py-2 text-body',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3',
            // `sidebar-accent-foreground` is the token that EXISTS for ink on
            // `sidebar-accent`; this row was using `sidebar-primary` (the raw
            // fill violet) instead, which is what made the current page's own
            // label the least readable text in the nav.
            isActive
              ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
              : 'font-medium text-secondary-foreground'
          )
          // Hover is branched rather than shared because the active item
          // already OWNS a fill: a neutral `hover:bg-muted` on it would paint
          // the violet away and make the current page look unselected while
          // the mouse rests on it. The active row deepens its own tint; the
          // rest borrow the neutral one.
          const navButtonClassName = cn(
            itemClassName,
            interactive,
            isActive
              ? 'hover:bg-sidebar-accent/70 active:bg-sidebar-accent/50'
              : 'hover:bg-muted hover:text-foreground active:bg-muted/60'
          )
          return (
            <li key={domain}>
              {available ? (
                <button
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onNavigate(domain)}
                  title={collapsed ? label : undefined}
                  className={navButtonClassName}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className={collapsed ? 'sr-only' : undefined}>{label}</span>
                </button>
              ) : (
                <span aria-disabled="true" title={collapsed ? label : undefined} className={itemClassName}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className={collapsed ? 'sr-only' : undefined}>{label}</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex-1" />

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onExport}
          title={collapsed ? 'Exportar datos' : undefined}
          className={cn(
            'flex items-center rounded-lg py-2 text-left text-secondary-foreground',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3',
            interactiveGhost
          )}
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
          <span className={cn('text-body font-medium', collapsed && 'sr-only')}>Exportar datos</span>
        </button>
        <div
          title={collapsed ? 'Guardado local' : undefined}
          className={cn('flex items-center text-muted-foreground', collapsed ? 'justify-center' : 'gap-2 px-3')}
        >
          <HardDrive className="h-3 w-3 shrink-0" aria-hidden />
          <span className={cn('text-caption', collapsed && 'sr-only')}>Guardado local</span>
        </div>
      </div>
    </nav>
  )
}
