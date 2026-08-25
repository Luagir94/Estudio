// Shadcn/ui-style Label primitive, implementing the type scale's `label` step
// (10px / 600 / 0.6px tracking — see globals.css and the design system group
// in the .pen). It used to ship unadapted shadcn boilerplate at `text-body-lg
// font-medium`: 14px sentence-case field labels next to `<legend>` elements
// that had already been hand-fitted to the `label` token, so the same modal
// rendered TIPO and "Tipo" side by side. The token's 0.6px tracking is sized
// for UPPERCASE, and static label copy carries its own casing: the i18n
// strings are literally uppercase, the way the legends already did it. The
// `uppercase` CLASS stays reserved for strings built at runtime (ClassRow's
// "starts in" pill, AttachmentRow's file extension) where no catalog entry
// exists to carry the casing.
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
      className={cn('mb-1 block text-label font-semibold text-secondary-foreground', className)}
      {...props}
    />
  )
})
