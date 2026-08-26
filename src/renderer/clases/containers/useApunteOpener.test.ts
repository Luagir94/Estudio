// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { seedApunte } from './useApunteOpener'

describe('seedApunte', () => {
  /*
   * A brand-new apunte cannot be born EMPTY: an apunte with no text is no
   * apunte at all — the save path deletes it — so creating one and opening the
   * editor on it would delete the document in the same breath that created it.
   * The seed is what makes a new apunte exist long enough to be written into.
   */
  it('is not empty, because an empty apunte deletes itself', () => {
    expect(seedApunte('2026-08-24').trim().length).toBeGreaterThan(0)
  })

  /*
   * It is the class's own date as a heading: it names the document without
   * inventing anything about what happened in that class, and it doubles as
   * the preview line the APUNTES list shows until the student writes a real
   * first line.
   */
  it('titles the apunte with the class it belongs to', () => {
    expect(seedApunte('2026-08-24')).toContain('24 de agosto')
    expect(seedApunte('2026-08-24').startsWith('# ')).toBe(true)
  })

  /*
   * A trailing blank line means the caret lands under the heading rather than
   * beside it — the student types the apunte, not a longer title.
   */
  it('leaves a blank line under the heading to write into', () => {
    expect(seedApunte('2026-08-24').endsWith('\n\n')).toBe(true)
  })
})
