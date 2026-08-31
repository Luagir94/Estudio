import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn — custom type scale', () => {
  // The bug this exists to stop: `text-body` is a FONT SIZE from `@theme`, but
  // stock tailwind-merge files any unknown `text-*` under text-color. Colliding
  // with a real colour meant the size lost, silently, everywhere — including
  // the Button primitive's own 12px/600 base.
  it('keeps a custom font size beside a text colour', () => {
    expect(cn('text-body', 'text-primary-foreground')).toBe('text-body text-primary-foreground')
  })

  it('still lets one custom font size override another', () => {
    expect(cn('text-body-lg', 'text-body-sm')).toBe('text-body-sm')
  })

  it('still lets one text colour override another', () => {
    expect(cn('text-foreground', 'text-muted-foreground')).toBe('text-muted-foreground')
  })

  // The ordinary conflicts must keep working — this is an extension, not a
  // replacement.
  it('resolves spacing conflicts the way it always did', () => {
    expect(cn('px-4', 'px-2')).toBe('px-2')
  })
})
