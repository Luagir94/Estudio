import { describe, expect, it } from 'vitest'
import { focusRing, focusRingWithin, interactive } from './interactive'

// The design's Principio 02 puts `$accent` on the focus state, so every
// focusable surface has to end up drawing an accent-coloured ring. These
// tests pin the two shapes that ring comes in — the element's own, and the
// one a composed field draws around its parts.
describe('focus ring', () => {
  it('draws on :focus-visible, never on plain :focus', () => {
    expect(focusRing).toContain('focus-visible:outline-2')
    expect(focusRing).toContain('focus-visible:outline-ring')
    expect(focusRing).not.toMatch(/(^|\s)focus:/)
  })

  it('rides along with every interactive surface', () => {
    expect(interactive).toContain(focusRing)
  })
})

// A composed field is a wrapper frame holding an icon or a suffix beside a
// bare `<input>`: the parcial's "#" nota, the materia's "%" asistencia, the
// Ask composer. The inner control cannot draw the ring (it would outline the
// input alone, inside a box the user reads as ONE field), so the wrapper
// draws it — and three of them dropped the outline without replacing it,
// which left the keyboard with no way to tell where it was.
describe('focusRingWithin', () => {
  it('draws the same accent ring, keyed on the wrapper', () => {
    expect(focusRingWithin).toContain('focus-within:outline-2')
    expect(focusRingWithin).toContain('focus-within:outline-offset-2')
    expect(focusRingWithin).toContain('focus-within:outline-ring')
  })

  it('offsets the ring like `focusRing` does, so both read as one language', () => {
    expect(focusRingWithin.replace(/focus-within:/g, '')).toBe(focusRing.replace(/focus-visible:/g, ''))
  })
})
