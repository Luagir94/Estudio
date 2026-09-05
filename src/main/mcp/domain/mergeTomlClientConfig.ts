// The TOML half of `mergeClientConfig` — same contract, same fail-closed
// discipline, one deliberately different METHOD.
//
// The JSON side parses, mutates and re-serialises, and states in its own header
// why that is safe there and only there: JSON carries no comments to lose. TOML
// does, and Codex's `~/.codex/config.toml` is a file the student writes by hand.
// A parse-and-re-serialise round trip through any TOML library would hand that
// file back stripped of every comment and every formatting choice in it — a
// silent, total rewrite of a file this app does not own, to change one table.
//
// So this module never parses the file. It finds the byte range of the ONE
// table it owns, replaces or removes exactly that range, and copies every other
// byte through untouched. Everything above and below our block survives
// verbatim, comments included. That is the whole design, and it is why there is
// no TOML dependency in this project's `package.json`.
//
// It is line-oriented rather than grammar-aware, which has one honest limit: a
// table header written inside a multi-line string would be read as a real
// header. That direction of error is safe — it can only make this module refuse
// or split a block early, never make it write over a table it did not
// recognise — and no config any of these clients writes contains one.
//
// VERIFIED against codex-cli 0.148.0-alpha.15 on Windows, 2026-09-05: the
// `[mcp_servers.<name>]` + `[mcp_servers.<name>.env]` vocabulary below is the
// shape `codex mcp add` itself writes and `codex mcp list` reads back.
import { COURSE_COMPANION_SERVER_KEY, type McpServerEntry, type MergeResult } from './mergeClientConfig'

/** TOML bare keys — anything else has to be quoted to survive the round trip. */
const BARE_KEY = /^[A-Za-z0-9_-]+$/

const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A TOML basic string. JSON's escape vocabulary is a subset of TOML's, so this is exact for the values we write. */
const tomlString = (value: string): string => JSON.stringify(value)

const tomlKey = (key: string): string => (BARE_KEY.test(key) ? key : tomlString(key))

/**
 * The key path of a table header line, or `null` when the line is not one.
 *
 * Splits on unquoted dots only, so a quoted segment holding a dot stays one
 * segment — and strips the quotes, so `[a."b"]` and `[a.b]` compare equal.
 */
function headerPath(line: string): string[] | null {
  const match = /^\s*\[{1,2}([^\]]*)\]{1,2}\s*(?:#.*)?$/.exec(line)
  if (!match) {
    return null
  }

  const segments: string[] = []
  let current = ''
  let quote: string | null = null

  for (const char of match[1] ?? '') {
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '.') {
      segments.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  segments.push(current.trim())

  return segments
}

/** The block this app owns: the client's server table for our key, and any sub-table under it. */
const ownsPath = (path: string[] | null, tablePrefix: string): boolean =>
  path !== null && path[0] === tablePrefix && path[1] === COURSE_COMPANION_SERVER_KEY

/**
 * Whether the file states its server map in a shape this module cannot edit
 * surgically — one inline table, one flat table of named keys, or a dotted-key
 * assignment at the root.
 *
 * Appending our own `[prefix.course-companion]` table alongside any of those
 * would define the same key twice, which does not make the file a bit wrong: it
 * makes the whole file unparseable, taking every OTHER server in it down. So
 * this is a refusal, never a best effort.
 */
function statesServersAsTables(lines: readonly string[], tablePrefix: string): boolean {
  const prefix = escapeForRegex(tablePrefix)
  const flatTable = new RegExp(`^\\s*\\[\\s*(?:"${prefix}"|'${prefix}'|${prefix})\\s*\\]`)
  const rootAssignment = new RegExp(`^\\s*(?:"${prefix}"|'${prefix}'|${prefix})\\s*[.=]`)

  return !lines.some((line) => flatTable.test(line) || rootAssignment.test(line))
}

/** Our table, rendered. Ends on a blank line so the next table always gets a separator. */
function renderBlock(tablePrefix: string, entry: McpServerEntry): string[] {
  const header = `${tomlKey(tablePrefix)}.${tomlKey(COURSE_COMPANION_SERVER_KEY)}`
  const lines = [
    `[${header}]`,
    `command = ${tomlString(entry.command)}`,
    `args = [${entry.args.map(tomlString).join(', ')}]`,
    ''
  ]

  const env = Object.entries(entry.env)
  if (env.length > 0) {
    lines.push(`[${header}.env]`, ...env.map(([key, value]) => `${tomlKey(key)} = ${tomlString(value)}`), '')
  }

  return lines
}

/** The half-open line range our block occupies, or `null` when it is not in the file. */
function findBlock(lines: readonly string[], tablePrefix: string): { start: number; end: number } | null {
  const start = lines.findIndex((line) => ownsPath(headerPath(line), tablePrefix))
  if (start === -1) {
    return null
  }

  for (let index = start + 1; index < lines.length; index += 1) {
    const path = headerPath(lines[index] ?? '')
    if (path !== null && !ownsPath(path, tablePrefix)) {
      return { start, end: index }
    }
  }

  return { start, end: lines.length }
}

/** Drops the trailing empty lines a `split('\n')` leaves behind, so appending adds exactly one separator. */
function withoutTrailingBlanks(lines: readonly string[]): string[] {
  const trimmed = [...lines]
  while (trimmed.length > 0 && trimmed[trimmed.length - 1]?.trim() === '') {
    trimmed.pop()
  }
  return trimmed
}

const settle = (raw: string | null, next: string): MergeResult => ({
  ok: true,
  contents: next,
  changed: next !== (raw ?? '')
})

/**
 * Returns the client's config file with this app's server table present and
 * current, every other byte in the file untouched.
 *
 * Idempotent by construction: our block is rendered deterministically, so
 * re-running with an unchanged entry produces the identical file and reports
 * `changed: false` — which is what lets the writer skip backing up and
 * rewriting a config the student did not ask it to touch.
 */
export function mergeTomlClientConfig(raw: string | null, tablePrefix: string, entry: McpServerEntry): MergeResult {
  if (raw === null || raw.trim() === '') {
    return settle(raw, renderBlock(tablePrefix, entry).join('\n'))
  }

  const lines = raw.split('\n')
  if (!statesServersAsTables(lines, tablePrefix)) {
    return { ok: false, reason: 'servers-not-tables' }
  }

  const block = renderBlock(tablePrefix, entry)
  const found = findBlock(lines, tablePrefix)

  if (!found) {
    return settle(raw, [...withoutTrailingBlanks(lines), '', ...block].join('\n'))
  }

  return settle(raw, [...lines.slice(0, found.start), ...block, ...lines.slice(found.end)].join('\n'))
}

/**
 * Returns the client's config file with this app's table gone — the revoke
 * half, so a revoked token does not leave a dead server behind for the student
 * to clean up by hand.
 *
 * Removing the block takes the blank separator that followed it with it, which
 * is what makes register-then-unregister land back on the original bytes.
 */
export function removeTomlClientConfig(raw: string | null, tablePrefix: string): MergeResult {
  if (raw === null || raw.trim() === '') {
    return { ok: true, contents: raw ?? '', changed: false }
  }

  const lines = raw.split('\n')
  if (!statesServersAsTables(lines, tablePrefix)) {
    return { ok: false, reason: 'servers-not-tables' }
  }

  const found = findBlock(lines, tablePrefix)
  if (!found) {
    return { ok: true, contents: raw, changed: false }
  }

  return settle(raw, [...lines.slice(0, found.start), ...lines.slice(found.end)].join('\n'))
}
