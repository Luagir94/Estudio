// Overflow / choice menu (design node `GsoRX` — "Overflow Menu", verified via
// the Pencil MCP tools): a trigger plus a small floating list of actions.
//
// Two surfaces need exactly this now — the subject detail header's `⋯`
// (Editar / Eliminar materia) and the ADJUNTOS tab's "+ Agregar" (subir un
// archivo / escribir un documento) — and both need the same three behaviours
// that are easy to get wrong once, let alone twice: Escape closes AND returns
// focus to the trigger, a click outside closes, and choosing an item closes
// before it acts.
//
// Values are the approved menu's: 200px wide, radius 10, 6px padding, card
// surface on the border, and the shadow that lifts it off whatever it
// overlaps. Items are radius 8, 10px gap, 8px/10px padding, 12px label.
import { useEffect, useId, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button, type ButtonProps } from './button'
import { cn } from '../../lib/cn'
import { interactive } from '../../lib/interactive'

export interface ActionMenuItem {
  id: string
  label: string
  icon: LucideIcon
  /** `destructive` paints the item with the urgent ink. Default `default`. */
  tone?: 'default' | 'destructive'
  onSelect: () => void
}

interface ActionMenuProps {
  /** Accessible name for both the trigger and the menu it opens. */
  label: string
  /** Trigger content — an icon, or an icon plus a label. */
  trigger: React.ReactNode
  /** Trigger styling, expressed through the `Button` primitive rather than raw classes. */
  triggerVariant?: ButtonProps['variant']
  triggerSize?: ButtonProps['size']
  triggerClassName?: string
  items: ActionMenuItem[]
}

const MENU_ITEM = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-body-sm'

export function ActionMenu({
  label,
  trigger,
  triggerVariant = 'tonal',
  triggerSize = 'compact',
  triggerClassName,
  items
}: ActionMenuProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!isOpen) {
      return
    }
    function handlePointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsOpen(false)
        // Escape that leaves focus on a node which just disappeared drops the
        // keyboard user at the top of the document.
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={triggerRef}
        variant={triggerVariant}
        size={triggerSize}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((open) => !open)}
        className={triggerClassName}
      >
        {trigger}
      </Button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          // `rounded-xl` (12), not the `rounded-[10px]` this carried. 10 was
          // in neither the design's radius ladder (4/6/8/12/24) nor anywhere
          // else in the app, and the geometry wants more, not less: with 6px
          // of padding around radius-8 items, the concentric outer radius is
          // 8 + 6 = 14. 12 is the declared step nearest that; 10 was further
          // from it AND undeclared.
          className="absolute top-[calc(100%+6px)] right-0 z-20 flex w-[200px] flex-col rounded-xl border border-border bg-card p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
        >
          {items.map((item) => {
            const Icon = item.icon
            const isDestructive = item.tone === 'destructive'
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false)
                  item.onSelect()
                }}
                className={cn(
                  MENU_ITEM,
                  interactive,
                  isDestructive
                    ? 'text-destructive hover:bg-(--color-urgent-soft)'
                    : 'text-foreground hover:bg-secondary'
                )}
              >
                <Icon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    isDestructive ? 'text-destructive' : 'text-secondary-foreground'
                  )}
                  aria-hidden="true"
                />
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
