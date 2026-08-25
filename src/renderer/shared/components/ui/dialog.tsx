// Shadcn/ui-style Dialog shell. `DialogContent` owns the modal a11y contract
// for every dialog in the app (no portal — dialogs render in place):
// `role="dialog"` + `aria-modal`, Escape → `onDismiss`, an in-house focus
// trap (focus moves in on mount, Tab/Shift+Tab wrap, focus returns to the
// opener on unmount). Consumers keep supplying their own `aria-label`.
//
// Design's modal pattern (verified against every `Modal` frame in the .pen via
// the Pencil MCP tools): dialog over a `#05050899` scrim, 12px-radius panel
// (`rounded-xl`; all 18 modal frames agree, and 14px is not a step in the
// design's 4/6/8/12 radius set — an earlier note here said 14px), a header
// section (title block + close `x` icon) with a bottom hairline, a padded
// body, and a footer section with a top hairline on the canvas-tint `$bg`
// (not the panel's `$surface`) — each section owns its own padding, there
// is no single uniform panel padding.
import { useEffect, useRef, type HTMLAttributes } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { interactiveGhost } from '../../lib/interactive'

export function DialogOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center bg-(--color-scrim) p-4', className)}
      {...props}
    />
  )
}

// What the trap treats as focusable. Deliberately the simple selector-level
// approximation (no visibility walk): dialog content is small and always
// rendered, so `disabled`/`tabindex="-1"` are the only exclusions that occur.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Called when the user presses Escape. Wire it to the dialog's SAFE exit —
   * the same handler as Cancel/close, never the destructive action. Omitted,
   * Escape does nothing (for dialogs with no dismiss path).
   */
  onDismiss?: () => void
}

// The panel itself never scrolls — `DialogBody` does (see below). Scrolling
// the whole panel is what pushed the footer's submit button off a short
// window: the way out of the dialog scrolled away with the content.
// `100dvh` rather than `100vh` so the cap tracks the real viewport.
export function DialogContent({ className, onDismiss, ...props }: DialogContentProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  // The keydown listener binds once per mount; the ref keeps it reading the
  // latest onDismiss without re-subscribing on every render.
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  })

  useEffect(() => {
    const content = contentRef.current
    if (content === null) {
      return
    }
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Recomputed on every keystroke, not cached: dialog content is dynamic
    // (buttons disable in flight, error rows appear), and a stale list would
    // tab onto a button that is no longer there.
    const focusables = (): HTMLElement[] => Array.from(content.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    // First focusable doubles as the safest default: the confirm dialogs put
    // Cancel first in the footer. The panel itself (tabIndex={-1}) is the
    // fallback so focus never stays behind the modal.
    ;(focusables()[0] ?? content).focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        const dismiss = onDismissRef.current
        if (dismiss !== undefined) {
          event.preventDefault()
          dismiss()
        }
        return
      }
      if (event.key !== 'Tab') {
        return
      }
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        content.focus()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      // Only the wrap points are intercepted; between them the browser's own
      // Tab order applies. `!contains` re-captures focus that escaped (e.g.
      // devtools, or the panel itself holding focus).
      if (event.shiftKey) {
        if (active === first || !content.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !content.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    // Document-level so Escape works wherever focus sits; removed on unmount,
    // and focus goes back to whatever opened the dialog.
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [])

  return (
    <div
      ref={contentRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className={cn(
        'flex max-h-[calc(100dvh-2rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border',
        'border-border bg-card text-card-foreground shadow-xl',
        className
      )}
      {...props}
    />
  )
}

interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {
  onClose?: () => void
}

export function DialogHeader({ className, onClose, children, ...props }: DialogHeaderProps) {
  const { t } = useTranslation('common')
  return (
    <div
      className={cn('flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4', className)}
      {...props}
    >
      <div className="flex flex-col gap-1">{children}</div>
      {onClose && (
        // The negative margin is load-bearing: the padding grows the hit
        // target (a 16px glyph is a miserable click target) without moving
        // the glyph itself, so the header keeps its designed alignment.
        <button
          type="button"
          onClick={onClose}
          aria-label={t('dialog.close')}
          className={cn('-m-2 rounded-md p-2 text-muted-foreground', interactiveGhost)}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

// The one scroll container in the dialog. `min-h-0` is load-bearing: a flex
// child defaults to `min-height: auto`, which refuses to shrink below its
// content — without it the body pushes the panel past the viewport instead
// of scrolling inside it, and the header and footer go with it.
export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6', className)} {...props} />
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-end gap-3 border-t border-border bg-background px-6 py-4',
        className
      )}
      {...props}
    />
  )
}
