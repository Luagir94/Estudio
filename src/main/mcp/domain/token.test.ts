import { describe, expect, it } from 'vitest'
import { generateToken, hashToken, tokensMatch, TOKEN_PREFIX } from './token'

describe('generateToken', () => {
  it('returns a cc_-prefixed base64url token of the expected length', () => {
    const token = generateToken()
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true)
    expect(token).toMatch(/^cc_[A-Za-z0-9_-]{43}$/)
  })

  it('generates a different token on every call (real entropy, not a fixture)', () => {
    const first = generateToken()
    const second = generateToken()
    expect(first).not.toBe(second)
  })
})

describe('hashToken', () => {
  it('hashes the same token to the same digest (deterministic sha256 hex)', () => {
    const token = generateToken()
    expect(hashToken(token)).toBe(hashToken(token))
  })

  it('hashes two different tokens to different digests', () => {
    expect(hashToken('cc_aaa')).not.toBe(hashToken('cc_bbb'))
  })

  it('returns a 64-char lowercase hex digest', () => {
    expect(hashToken('cc_sample')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('tokensMatch', () => {
  it('returns true for two equal hashes', () => {
    const hash = hashToken('cc_sample')
    expect(tokensMatch(hash, hash)).toBe(true)
  })

  it('returns false for two different hashes', () => {
    expect(tokensMatch(hashToken('cc_one'), hashToken('cc_two'))).toBe(false)
  })

  it('returns false, not throw, when compared hashes have different lengths', () => {
    expect(tokensMatch('ab', hashToken('cc_sample'))).toBe(false)
  })
})
