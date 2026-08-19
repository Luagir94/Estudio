import path from 'node:path'

// Security boundary (design "Path Handling"). These two functions are the
// ONLY place a picker-supplied file name or a stored (relative) path may be
// turned into a real filesystem path — nothing else in `adjuntos` may join
// paths on its own.

const RESERVED_CHARS = /[<>:"/\\|?*]/g
// 0x00-0x1F covers NUL plus every other ASCII control character (tab,
// newline, escape, …) that a filename must never carry on Windows.
const CONTROL_CHARS = /[\x00-\x1F]/g
const TRAILING_DOTS_OR_SPACES = /[. ]+$/
const RESERVED_STEMS = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
])

const MAX_EXTENSION_LENGTH = 10
const MAX_NAME_LENGTH = 100
const FALLBACK_NAME = 'archivo'

/**
 * Turns an arbitrary, picker-supplied file name into something safe to
 * store on disk. Order matters: `path.basename` runs FIRST so it alone
 * defeats `..` traversal, absolute paths, and embedded separators before
 * any character-level cleanup happens.
 */
export function sanitizeFileName(rawName: string): string {
  let name = path.basename(rawName)
  name = name.replace(RESERVED_CHARS, '_').replace(CONTROL_CHARS, '_')
  name = name.replace(TRAILING_DOTS_OR_SPACES, '')

  name = prefixReservedStem(name)
  name = capLength(name)

  return name === '' ? FALLBACK_NAME : name
}

/**
 * Windows treats these device stems as reserved regardless of extension —
 * `CON.txt` is just as reserved as bare `CON`. The check is case-insensitive
 * and applies to the STEM only, so `constitution.pdf` is untouched.
 */
function prefixReservedStem(name: string): string {
  const stem = path.basename(name, path.extname(name))
  if (RESERVED_STEMS.has(stem.toUpperCase())) {
    return `_${name}`
  }
  return name
}

/**
 * Caps the extension at 10 chars and the whole name at 100, always
 * preserving the (possibly-capped) extension rather than truncating into
 * the middle of it.
 */
function capLength(name: string): string {
  let ext = path.extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name

  if (ext.length - 1 > MAX_EXTENSION_LENGTH) {
    ext = ext.slice(0, MAX_EXTENSION_LENGTH + 1)
  }

  if (stem.length + ext.length <= MAX_NAME_LENGTH) {
    return stem + ext
  }

  const cappedStemLength = Math.max(MAX_NAME_LENGTH - ext.length, 0)
  return stem.slice(0, cappedStemLength) + ext
}

export class InvalidAttachmentPathError extends Error {
  readonly code = 'INVALID_PATH' as const

  constructor(storedPath: string) {
    super(`INVALID_PATH: storedPath escapes the attachments root: ${storedPath}`)
    this.name = 'InvalidAttachmentPathError'
  }
}

/**
 * The ONLY place a stored (relative) path is joined back to an absolute
 * one. Containment is a REAL directory-boundary check via `path.relative`,
 * never `startsWith` — a `startsWith(rootDir)` check would be defeated by a
 * sibling directory like `attachments-evil` that merely shares the
 * `attachments` string prefix.
 */
export function resolveAttachmentPath(rootDir: string, storedPath: string): string {
  const resolved = path.resolve(rootDir, storedPath)
  const relative = path.relative(rootDir, resolved)

  if (relative === '' || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new InvalidAttachmentPathError(storedPath)
  }

  return resolved
}
