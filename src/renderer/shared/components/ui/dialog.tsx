// Shadcn/ui-style Dialog shell — presentational only, no focus-trap/portal
// logic (out of scope for this styling-only corrective unit; the existing
// `role="dialog"` + `aria-label` markup on the consuming component is
// preserved unchanged, this only supplies the scrim + panel chrome).
//
// Design's modal pattern (verified against `A1dN7`/`hjivW` via the Pencil
// MCP tools): dialog over a `#05050899` scrim, 14px-radius panel, a header
// section (title block + close `x` icon) with a bottom hairline, a padded
// body, and a footer section with a top hairline on the canvas-tint `$bg`
// (not the panel's `$surface`) — each section owns its own padding, there
// is no single uniform panel padding.
import type { HTMLAttributes } from 'react'
import { X } from 'lucide-react'
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

// The panel itself never scrolls — `DialogBody` does (see below). Scrolling
// the whole panel is what pushed the footer's submit button off a short
// window: the way out of the dialog scrolled away with the content.
// `100dvh` rather than `100vh` so the cap tracks the real viewport.
export function DialogContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
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
          aria-label="Cerrar"
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
