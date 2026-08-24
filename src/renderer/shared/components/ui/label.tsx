// Shadcn/ui-style Label primitive.
import { forwardRef, type LabelHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(function Label(
  { className, ...props },
  ref
) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- primitive: usage sites associate by nesting the control as children
    <label
      ref={ref}
      className={cn('mb-1 block text-body-lg font-medium text-secondary-foreground', className)}
      {...props}
    />
  )
})
