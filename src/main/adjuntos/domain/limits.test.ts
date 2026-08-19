import { describe, expect, it } from 'vitest'
import { MAX_ATTACHMENT_BYTES } from './limits'

// Spec "Size Cap Enforcement": files over 250 MB must be rejected before
// any copy is attempted.
describe('MAX_ATTACHMENT_BYTES', () => {
  it('is exactly 250 MB, expressed in bytes', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(250 * 1024 * 1024)
  })
})
