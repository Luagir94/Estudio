import type { LucideIcon } from 'lucide-react'

interface AskStateCardProps {
  icon: LucideIcon
  title: string
  detail: string
  /** Spins the icon and announces the card as a live status — the waiting state. */
  busy?: boolean
  actionLabel?: string
  onAction?: () => void
}

/**
 * The centred icon/title/detail block every non-answer state uses (design
 * `Screen — Preguntar · Estados`). One shape for pending, empty, not-found
 * and every typed error, so a new failure cannot invent its own layout.
 *
 * `busy` does two things at once on purpose: it spins the icon for people who
 * can see it, and marks the card `role="status"` so a screen reader announces
 * that the app is working. A silent spinner tells half the users nothing.
 *
 * The spin needs no motion guard of its own — `globals.css` already collapses
 * every animation under `prefers-reduced-motion`.
 */
export function AskStateCard({
  icon: Icon,
  title,
  detail,
  busy = false,
  actionLabel,
  onAction
}: AskStateCardProps): React.JSX.Element {
  return (
    <div
      {...(busy ? { role: 'status' as const } : {})}
      className="flex flex-col items-center justify-center gap-2.5 px-6 py-6 text-center"
    >
      <Icon className={`size-6 text-muted-foreground${busy ? ' animate-spin' : ''}`} aria-hidden="true" />
      <p className="text-body-lg font-semibold text-foreground">{title}</p>
      <p className="text-body-sm leading-relaxed text-muted-foreground">{detail}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-1 rounded-lg bg-primary px-3.5 py-2 text-body-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
