// Shadcn/ui-style Button primitive, hand-built (no CLI scaffold — see
// components.json for the documented convention this follows). Variants
// map onto the dark-theme design's button language: primary action =
// `$accent` fill; destructive action = `$urgent`, always kept separated from
// the confirm button (see DeleteSubjectConfirmDialog).
//
// The two fills do NOT share a foreground, and neither is `--color-ink`.
// Each carries the ink its own luminance demands: violet is a dark fill and
// takes white (4.54:1), coral is a LIGHT fill and takes near-black (7.03:1).
// Painting both with the same light ink is what put the delete button at
// 2.80:1 — under the 4.5 floor, on the one button that cannot be undone.
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'
import { interactive } from '../../lib/interactive'

// Every hover/active rule below is gated on `enabled:` so a disabled button
// stays inert WITHOUT `disabled:pointer-events-none`. That class used to be
// here (shadcn ships it), but it also suppresses the cursor, so a disabled
// button could never show `not-allowed` — it just kept the arrow and looked
// like any other dead pixel. The `disabled` attribute already blocks the
// click on its own; pointer-events was only ever buying the hover suppression
// that `enabled:` now buys explicitly.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-body-lg font-medium ' +
    `${interactive} disabled:opacity-50`,
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground enabled:hover:bg-primary/90 enabled:active:bg-primary/80',
        destructive:
          'bg-destructive text-destructive-foreground enabled:hover:bg-destructive/90 enabled:active:bg-destructive/80',
        secondary:
          'bg-secondary text-secondary-foreground enabled:hover:bg-secondary/80 enabled:active:bg-secondary/70',
        ghost:
          'text-foreground enabled:hover:bg-accent enabled:hover:text-accent-foreground enabled:active:bg-accent/70',
        outline:
          'border border-border bg-transparent text-foreground enabled:hover:border-primary/40 ' +
          'enabled:hover:bg-accent enabled:active:bg-accent/70'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default'
    }
  }
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, className }))} {...props} />
})
