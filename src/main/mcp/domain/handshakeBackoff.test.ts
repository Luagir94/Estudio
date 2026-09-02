import { describe, expect, it } from 'vitest'
import { delayFor, MAX_PENDING_HANDSHAKES } from './handshakeBackoff'

describe('MAX_PENDING_HANDSHAKES', () => {
  it('caps concurrently pending handshakes at 4', () => {
    expect(MAX_PENDING_HANDSHAKES).toBe(4)
  })
})

describe('delayFor', () => {
  it('returns 1 second for zero prior consecutive failures (2^0)', () => {
    expect(delayFor(0)).toBe(1)
  })

  it('doubles the delay for each additional consecutive failure', () => {
    expect(delayFor(1)).toBe(2)
    expect(delayFor(2)).toBe(4)
    expect(delayFor(3)).toBe(8)
  })

  it('caps the delay at 8 seconds beyond the curve natural crossover', () => {
    expect(delayFor(4)).toBe(8)
    expect(delayFor(10)).toBe(8)
  })
})
