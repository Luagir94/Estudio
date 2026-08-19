// Main-process security control (design §7, spec "campusUrl Scheme
// Validation"): validates a user-supplied campusUrl BEFORE it is ever
// passed to `shell.openExternal`. https-only allowlist — renderer-side
// checks are UX only and MUST NOT be treated as the enforced control.
const ALLOWED_PROTOCOL = 'https:'

/**
 * Returns true only for a well-formed https URL. Any other scheme
 * (`javascript:`, `file:`, `http:`, `data:`, custom schemes) and any
 * malformed input that fails `new URL()` parsing are refused.
 */
export function isAllowedExternalUrl(candidateUrl: string): boolean {
  try {
    return new URL(candidateUrl).protocol === ALLOWED_PROTOCOL
  } catch {
    return false
  }
}
