// Shadcn/ui-style Textarea primitive (used only by the "Notas" field —
// still a single plain-text column per design §3, this is presentation
// only, no markdown editing surface).
//
// It does NOT share the Input's type step. Both "Notas Val" nodes in the
// .pen (`U1Lt8G` on materias, `FhjSy` on hoy) set 12px at 1.5 line-height,
// not the 14px a single-line field carries: this is the one control that
// holds a PARAGRAPH, and a paragraph needs leading the scale deliberately
// declines to declare on anything but the display steps. Padding is uniform
// 12 for the same reason — wrapped text sits in a box, not on a line.
import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { interactive } from '../../lib/interactive'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-20 w-full rounded-lg border border-input bg-background p-3 text-body leading-[1.5] text-foreground',
        `placeholder:text-muted-foreground enabled:hover:border-ring/50 ${interactive}`,
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
})
