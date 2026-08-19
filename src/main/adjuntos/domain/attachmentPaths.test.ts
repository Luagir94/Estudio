import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAttachmentPath, sanitizeFileName } from './attachmentPaths'

// Threat matrix (design "Path Handling" / spec "Add Attachment"): one test
// per adversarial case a native file picker (or a tampered DB row) can hand
// us. `sanitizeFileName` is the single choke point that turns an arbitrary
// picker-supplied name into something safe to store on disk;
// `resolveAttachmentPath` is the single choke point that turns a stored
// (relative) path back into an absolute one without ever escaping the root.
describe('sanitizeFileName', () => {
  it('strips a relative path-traversal prefix via basename', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd')
  })

  it('strips an absolute POSIX path via basename', () => {
    expect(sanitizeFileName('/etc/passwd')).toBe('passwd')
  })

  it('strips path separators, keeping only the final segment', () => {
    expect(sanitizeFileName('a/b/report.pdf')).toBe('report.pdf')
  })

  it('replaces reserved filesystem characters with underscores', () => {
    expect(sanitizeFileName('weird<>:"|?*name.txt')).toBe('weird_______name.txt')
  })

  it('replaces NUL and other control characters (0x00-0x1F) with underscores', () => {
    const nul = String.fromCharCode(0)
    const unitSeparator = String.fromCharCode(31)
    const withControlChars = `bad${nul}name${unitSeparator}end.txt`
    expect(sanitizeFileName(withControlChars)).toBe('bad_name_end.txt')
  })

  it('strips trailing dots and spaces', () => {
    expect(sanitizeFileName('trailing.dots...')).toBe('trailing.dots')
    expect(sanitizeFileName('trailing spaces   ')).toBe('trailing spaces')
  })

  it('prefixes an underscore on a Windows reserved stem before the extension (CON.txt)', () => {
    expect(sanitizeFileName('CON.txt')).toBe('_CON.txt')
  })

  it('treats the reserved-stem check as case-insensitive (lpt1.pdf)', () => {
    expect(sanitizeFileName('lpt1.pdf')).toBe('_lpt1.pdf')
  })

  it('prefixes a bare reserved name with no extension', () => {
    expect(sanitizeFileName('NUL')).toBe('_NUL')
  })

  it('does not flag a name that merely starts with a reserved stem', () => {
    expect(sanitizeFileName('constitution.pdf')).toBe('constitution.pdf')
  })

  it('caps the extension at 10 characters and the whole name at 100, preserving the extension', () => {
    const longExtension = 'a'.repeat(20)
    const result = sanitizeFileName(`file.${longExtension}`)
    const ext = path.extname(result)
    expect(ext.length).toBeLessThanOrEqual(11) // dot + 10 chars
    expect(result.length).toBeLessThanOrEqual(100)
    expect(result.endsWith(ext)).toBe(true)
  })

  it('truncates a very long file name to 100 characters total, preserving the extension', () => {
    const longStem = 'x'.repeat(300)
    const result = sanitizeFileName(`${longStem}.pdf`)
    expect(result.length).toBeLessThanOrEqual(100)
    expect(result.endsWith('.pdf')).toBe(true)
  })

  it('falls back to "archivo" when sanitization empties the name', () => {
    expect(sanitizeFileName('...')).toBe('archivo')
    expect(sanitizeFileName('   ')).toBe('archivo')
  })
})

describe('resolveAttachmentPath', () => {
  const rootDir = path.join('C:', 'userData', 'attachments')

  it('resolves a normal relative storedPath to an absolute path under the root', () => {
    const storedPath = path.join('42', 'uuid-report.pdf')
    expect(resolveAttachmentPath(rootDir, storedPath)).toBe(path.join(rootDir, storedPath))
  })

  it('throws INVALID_PATH for a `..`-escaping storedPath', () => {
    expect(() => resolveAttachmentPath(rootDir, path.join('..', 'outside.txt'))).toThrow('INVALID_PATH')
  })

  it('throws INVALID_PATH for an absolute storedPath outside the root', () => {
    expect(() => resolveAttachmentPath(rootDir, path.join('C:', 'Windows', 'system.ini'))).toThrow('INVALID_PATH')
  })

  it('throws INVALID_PATH for a storedPath equal to the root itself', () => {
    expect(() => resolveAttachmentPath(rootDir, '.')).toThrow('INVALID_PATH')
  })

  // The exact case a naive `startsWith(rootDir)` containment check would
  // MISS: `attachments-evil` shares the `attachments` prefix as a string but
  // is a completely different sibling directory. Only a real
  // `path.relative`-based boundary check catches this.
  it('throws INVALID_PATH for a sibling-directory escape (attachments-evil)', () => {
    const storedPath = path.join('..', 'attachments-evil', 'payload.txt')
    expect(() => resolveAttachmentPath(rootDir, storedPath)).toThrow('INVALID_PATH')
  })
})
