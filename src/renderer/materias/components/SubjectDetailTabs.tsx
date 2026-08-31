// Presentational (design node `Uy6vj` — "Tab Bar", verified via the Pencil MCP
// tools): the subject detail's section switcher. The left column used to stack
// ENTREGAS, PARCIALES, NOTAS, APUNTES and ADJUNTOS one under the other, which
// meant every section's own add button was on screen at once — five actions
// competing for the same glance. One section shows at a time now, so exactly
// one section action does too.
//
// The counts ride in the label ("Entregas · 3") because they answer the
// question the tab is there to answer: before this you had to scroll to the
// section to find out whether it held anything at all.
//
// ARIA follows the tabs pattern: a roving tabindex (only the active tab is in
// the page's tab order) plus arrow/Home/End navigation between tabs. The
// static `.pen` cannot draw keyboard behaviour, but a tab bar without it is a
// regression against the plain stacked headings it replaces.
import { Button } from '../../shared/components/ui/button'
import { cn } from '../../shared/lib/cn'

// APUNTES is one tab, not two. A class apunte and an uploaded file are the
// same record differing only by `classDate`, so ADJUNTOS and APUNTES were one
// list drawn twice — and "adjuntos" is file-manager language anyway; a student
// says apuntes for the whole pile.
export type SubjectDetailTabId = 'entregas' | 'parciales' | 'apuntes' | 'notas'

export const SUBJECT_DETAIL_TAB_IDS: SubjectDetailTabId[] = ['entregas', 'parciales', 'apuntes', 'notas']

/**
 * Whether an unknown value names a tab. The address bar is an untrusted
 * input — a stale or hand-edited `?tab=` must fall back to the default rather
 * than select a panel that does not exist.
 */
export function isSubjectDetailTabId(value: unknown): value is SubjectDetailTabId {
  return typeof value === 'string' && (SUBJECT_DETAIL_TAB_IDS as string[]).includes(value)
}

export interface SubjectDetailTab {
  id: SubjectDetailTabId
  label: string
  /** Appended to the label as "· N". Omitted — like a zero — prints nothing. */
  count?: number
}

interface SubjectDetailTabsProps {
  tabs: SubjectDetailTab[]
  activeTab: SubjectDetailTabId
  onSelect: (id: SubjectDetailTabId) => void
  /** Accessible name for the tablist. */
  label: string
  /**
   * The active tab's own action, drawn at the right end of the same row
   * (design: `Uy6vj` is a space-between row). Sections that own their action
   * inside their own container reach this row through `TabActionSlot`
   * instead — hence the second, portal-only div beside this one.
   */
  action?: React.ReactNode
  /** Portal target for `TabActionSlot`. React never renders children into it. */
  actionSlotRef?: React.Ref<HTMLDivElement>
}

/** The id `SubjectDetail` gives the panel a tab controls, so both agree on it. */
export function panelIdFor(tab: SubjectDetailTabId): string {
  return `subject-detail-panel-${tab}`
}

export function SubjectDetailTabs({
  tabs,
  activeTab,
  onSelect,
  label,
  action,
  actionSlotRef
}: SubjectDetailTabsProps): React.JSX.Element {
  // On the TABS, not on the tablist: the tablist itself is never focusable in
  // a roving-tabindex pattern, so a key handler there would only ever fire by
  // bubbling — and `jsx-a11y` rightly refuses a keyboard handler on a node
  // that cannot take focus.
  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    const index = tabs.findIndex((tab) => tab.id === activeTab)
    if (index === -1) {
      return
    }
    const targetIndex =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null
    if (targetIndex === null) {
      return
    }
    const target = tabs[targetIndex]
    if (target === undefined) {
      return
    }
    event.preventDefault()
    onSelect(target.id)
  }

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div role="tablist" aria-label={label} className="flex items-center gap-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <Button
              key={tab.id}
              // `compact` is the ONE height this row is built from — the tab
              // used to hand-roll `py-1.5` (27px) beside a 29px action button.
              variant={isActive ? 'tonal' : 'ghost'}
              size="compact"
              role="tab"
              id={`subject-detail-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={panelIdFor(tab.id)}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={handleKeyDown}
              className={cn(!isActive && 'text-muted-foreground')}
            >
              {/* The count is appended outside the translation so the i18n key
                  stays a plain section name — the same idiom the adjuntos
                  heading already used before it became a tab. */}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && ` · ${tab.count}`}
            </Button>
          )
        })}
      </div>

      {/* NO gap on this wrapper, and that is load-bearing. The portal slot
          below is always in the DOM (its ref has to exist), so on a tab whose
          action arrives through `action` the wrapper holds TWO children — the
          button and an empty div — and a `gap` would measure the void between
          them, pushing the button 8px off the row's end. Every other tab has
          one child and sits flush, so the button appeared to shift sideways
          when you switched to Entregas.

          The two are mutually exclusive by construction — an action reaches
          the row through one path or the other, never both — so there is no
          spacing for this wrapper to own. The slot keeps its own gap, for the
          sections that portal in two controls (Sincronizar + Agregar). */}
      <div className="flex shrink-0 items-center">
        {action}
        <div ref={actionSlotRef} className="flex items-center gap-2" />
      </div>
    </div>
  )
}
