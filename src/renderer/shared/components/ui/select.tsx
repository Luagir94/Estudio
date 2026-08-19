// Shadcn/ui-style Select primitive. A native <select> rather than a Radix
// combobox: the domain forms (SlotEditor's día picker) only ever need a
// plain single-choice dropdown, and native selects keep full keyboard/a11y
// behavior with zero extra dependency surface.
import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { interactive } from '../../lib/interactive'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-body-lg text-foreground',
        `enabled:hover:border-ring/50 ${interactive}`,
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
})
