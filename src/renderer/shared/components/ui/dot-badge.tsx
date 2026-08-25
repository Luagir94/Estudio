// The design's "Result Badge" as a primitive: 6px radius, a 1px inner
// stroke, 4/8 padding, a 6px dot and a 12px/600 label.
//
// It lives here rather than in a slice because TWO slices draw it from the
// same four tones — the parcial result badge (parciales) and the regularidad
// badge in the subject header (materias) — and a badge that is "the same
// pattern" in two places is exactly the thing that drifts when each side owns
// its own copy of the class list.
//
// The dot is `aria-hidden`: it repeats the state the label already names, so
// announcing it would just make a screen reader say everything twice.
import { type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Semantic tone, never a colour name. Violet (`accent`) is reserved for
 * interaction everywhere else in this app, and it is spent here on ONE state
 * only — promoción, the outcome the design singles out.
 */
export type DotBadgeTone = 'ok' | 'accent' | 'urgent' | 'neutral'

const TONE_STYLES: Record<DotBadgeTone, { badge: string; dot: string }> = {
  ok: { badge: 'border-ok bg-ok-soft text-ok', dot: 'bg-ok' },
  accent: { badge: 'border-primary bg-sidebar-accent text-primary-ink', dot: 'bg-primary' },
  urgent: { badge: 'border-destructive bg-urgent-soft text-destructive', dot: 'bg-destructive' },
  neutral: { badge: 'border-border bg-muted text-muted-foreground', dot: 'bg-muted-foreground' }
}

interface DotBadgeProps {
  tone: DotBadgeTone
  children: ReactNode
  className?: string
}

export function DotBadge({ tone, children, className }: DotBadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-2 py-1 text-caption font-semibold',
        TONE_STYLES[tone].badge,
        className
      )}
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_STYLES[tone].dot)} />
      {children}
    </span>
  )
}
