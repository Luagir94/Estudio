// Shadcn/ui-style Textarea primitive (used only by the "Notas" field —
// still a single plain-text column per design §3, this is presentation
// only, no markdown editing surface).
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
        'flex min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-body-lg text-foreground',
        `placeholder:text-muted-foreground enabled:hover:border-ring/50 ${interactive}`,
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
})
