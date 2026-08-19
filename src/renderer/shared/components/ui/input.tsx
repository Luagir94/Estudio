// Shadcn/ui-style Input primitive. Design's modal pattern: `$bg` fill with
// a `$border` hairline, 8px radius.
import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { interactive } from '../../lib/interactive'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-body-lg text-foreground',
        `placeholder:text-muted-foreground enabled:hover:border-ring/50 ${interactive}`,
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
})
