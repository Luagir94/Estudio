// Shared className helper (shadcn/ui convention): merges conditional
// classes via clsx, then resolves conflicting Tailwind utility classes via
// tailwind-merge (e.g. a caller-supplied `px-2` overriding a base `px-4`).
// Lives under shared/, never under any domain/ folder — it is a rendering
// concern, not domain logic.
//
// The merge is EXTENDED with this app's own type scale, and that is not a
// nicety. `@theme`'s `--text-*` tokens produce utilities like `text-body` and
// `text-overline`; stock tailwind-merge has never heard of them, so it files
// them under `text-color` — the group `text-primary-foreground` also lives in.
// Same group means conflict, and the later class wins, so
// `cn('text-body', 'text-primary-foreground')` silently DELETED the font size.
//
// That is exactly what had been happening to every `Button` in the app: its
// base `text-body font-semibold` (12px/600, which is what ~96 of the 115
// button frames in the design draw) lost the `text-body` half to the variant's
// ink and rendered at whatever size it inherited. The `[color:var(--...)]`
// escape hatches scattered through the section components were the same
// collision, worked around from the other side.
//
// Keep this list in step with the `--text-*` tokens in `styles/globals.css`.
import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const FONT_SIZES = [
  'display-xl',
  'display-lg',
  'heading',
  'title',
  'body-lg',
  'body',
  'body-sm',
  'label',
  'caption',
  'overline',
  'micro'
]

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': FONT_SIZES.map((size) => `text-${size}`)
    }
  }
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
