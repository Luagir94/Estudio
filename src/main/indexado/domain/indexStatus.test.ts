import { describe, expect, it } from 'vitest'
import { guardIndexStatusTransition, InvalidIndexStatusError, isIndexStatus } from './indexStatus'

describe('isIndexStatus', () => {
  it('accepts every member of the closed set', () => {
    expect(isIndexStatus('pending')).toBe(true)
    expect(isIndexStatus('indexed')).toBe(true)
    expect(isIndexStatus('not-indexable')).toBe(true)
  })

  it('rejects a value outside the closed set', () => {
    expect(isIndexStatus('archived')).toBe(false)
  })
})

describe('guardIndexStatusTransition', () => {
  it('returns the target status for a normal forward transition (spec: New attachment starts pending)', () => {
    expect(guardIndexStatusTransition('pending', 'indexed')).toBe('indexed')
  })

  it('returns the target status for a transition into not-indexable', () => {
    expect(guardIndexStatusTransition('pending', 'not-indexable')).toBe('not-indexable')
  })

  it('is idempotent: re-applying the SAME status is a no-op, not an error (spec: Re-indexing is idempotent)', () => {
    expect(guardIndexStatusTransition('indexed', 'indexed')).toBe('indexed')
  })

  it('allows re-dispatching a not-indexable row back to indexed (spec: Sincronizar picks up stuck attachments)', () => {
    expect(guardIndexStatusTransition('not-indexable', 'indexed')).toBe('indexed')
  })

  it('throws InvalidIndexStatusError when the target status is outside the closed set', () => {
    expect(() => guardIndexStatusTransition('pending', 'done')).toThrow(InvalidIndexStatusError)
  })

  it('throws InvalidIndexStatusError when the current status is outside the closed set', () => {
    expect(() => guardIndexStatusTransition('unknown', 'indexed')).toThrow(InvalidIndexStatusError)
  })
})
