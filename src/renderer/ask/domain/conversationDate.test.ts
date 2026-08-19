import { describe, expect, it } from 'vitest'
import { formatConversationDate } from './conversationDate'

// Pure formatting (design #268 §3, node `yq8hL`/`ZFBZU`/`NKyiv`/`HKApD` —
// "Hoy, 14:32" / "Ayer, 19:05" / "12 ago"). `now` is injected so the
// today/yesterday split never depends on the real clock.
describe('formatConversationDate', () => {
  const now = new Date('2026-08-18T20:00')

  it('reads "Hoy, HH:mm" for the same calendar day', () => {
    expect(formatConversationDate('2026-08-18T14:32', now)).toBe('Hoy, 14:32')
  })

  it('reads "Ayer, HH:mm" for the previous calendar day', () => {
    expect(formatConversationDate('2026-08-17T19:05', now)).toBe('Ayer, 19:05')
  })

  it('reads "D mes" (lowercase, no year) for anything older', () => {
    expect(formatConversationDate('2026-08-12T09:00', now)).toBe('12 ago')
  })

  it('pads single-digit minutes and hours', () => {
    expect(formatConversationDate('2026-08-18T08:05', now)).toBe('Hoy, 08:05')
  })
})
