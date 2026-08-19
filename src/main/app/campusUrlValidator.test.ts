import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl } from './campusUrlValidator'

// Threat matrix (design "Threat Matrix" / spec "campusUrl Scheme
// Validation"): one test per scheme class. Enforced in the MAIN process —
// renderer-side checks are UX only, never the control.
describe('isAllowedExternalUrl', () => {
  it('allows https (the only allowed scheme)', () => {
    expect(isAllowedExternalUrl('https://campus.uni.edu/course/1')).toBe(true)
  })

  it('refuses javascript: URLs', () => {
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
  })

  it('refuses file: URLs', () => {
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false)
  })

  it('refuses http: (non-https) URLs', () => {
    expect(isAllowedExternalUrl('http://campus.uni.edu')).toBe(false)
  })

  it('refuses data: URLs', () => {
    expect(isAllowedExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('refuses custom-scheme URLs', () => {
    expect(isAllowedExternalUrl('myapp://open')).toBe(false)
  })

  it('refuses a malformed URL that fails to parse', () => {
    expect(isAllowedExternalUrl('ht!tp:/ /not a url')).toBe(false)
  })
})
