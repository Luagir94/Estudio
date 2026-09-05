import { describe, expect, it } from 'vitest'
import {
  COURSE_COMPANION_SERVER_KEY,
  mergeClientConfig,
  type McpServerEntry,
  removeClientConfig
} from './mergeClientConfig'

const ENTRY: McpServerEntry = {
  command: 'node',
  args: ['C:\\app\\resources\\mcp-shim\\index.cjs'],
  env: { COURSE_COMPANION_MCP_TOKEN: 'cc_mcp_abc123' }
}

const parse = (result: ReturnType<typeof mergeClientConfig>): Record<string, unknown> => {
  if (!result.ok) {
    throw new Error(`expected a successful merge, got ${result.reason}`)
  }
  return JSON.parse(result.contents) as Record<string, unknown>
}

describe('mergeClientConfig', () => {
  it('creates the whole file when none exists yet', () => {
    const result = mergeClientConfig(null, 'mcpServers', ENTRY)

    expect(parse(result)).toEqual({ mcpServers: { [COURSE_COMPANION_SERVER_KEY]: ENTRY } })
    expect(result).toMatchObject({ changed: true })
  })

  it('treats a whitespace-only file as an absent one rather than as malformed', () => {
    expect(parse(mergeClientConfig('  \n\t ', 'mcpServers', ENTRY))).toEqual({
      mcpServers: { [COURSE_COMPANION_SERVER_KEY]: ENTRY }
    })
  })

  // The fail-closed core. `~/.claude.json` carries the user's ENTIRE Claude
  // Code state; a file we could not parse is a file we did not understand,
  // and writing a fresh one over it would destroy every key it held.
  it('refuses to write over a file it cannot parse', () => {
    expect(mergeClientConfig('{ "mcpServers": ', 'mcpServers', ENTRY)).toEqual({
      ok: false,
      reason: 'unparseable'
    })
  })

  it.each([
    ['an array', '[]'],
    ['a number', '42'],
    ['a string', '"hello"'],
    ['null', 'null']
  ])('refuses to merge into valid JSON that is not an object (%s)', (_label, raw) => {
    expect(mergeClientConfig(raw, 'mcpServers', ENTRY)).toEqual({ ok: false, reason: 'not-an-object' })
  })

  it('refuses when the servers key exists but holds something other than an object', () => {
    expect(mergeClientConfig('{"mcpServers": ["oops"]}', 'mcpServers', ENTRY)).toEqual({
      ok: false,
      reason: 'servers-not-an-object'
    })
  })

  it('preserves every unrelated top-level key', () => {
    const existing = JSON.stringify({ numStartups: 41, projects: { '/repo': { allowedTools: [] } } })

    expect(parse(mergeClientConfig(existing, 'mcpServers', ENTRY))).toEqual({
      numStartups: 41,
      projects: { '/repo': { allowedTools: [] } },
      mcpServers: { [COURSE_COMPANION_SERVER_KEY]: ENTRY }
    })
  })

  it('preserves every OTHER server already registered', () => {
    const existing = JSON.stringify({ mcpServers: { engram: { command: 'engram' }, pencil: { command: 'pen' } } })

    expect(parse(mergeClientConfig(existing, 'mcpServers', ENTRY))).toEqual({
      mcpServers: {
        engram: { command: 'engram' },
        pencil: { command: 'pen' },
        [COURSE_COMPANION_SERVER_KEY]: ENTRY
      }
    })
  })

  it('replaces a stale entry of its OWN rather than appending a second one', () => {
    const stale = JSON.stringify({
      mcpServers: {
        [COURSE_COMPANION_SERVER_KEY]: { command: 'node', args: ['/old/path'], env: { X: 'old' } }
      }
    })

    expect(parse(mergeClientConfig(stale, 'mcpServers', ENTRY))).toEqual({
      mcpServers: { [COURSE_COMPANION_SERVER_KEY]: ENTRY }
    })
  })

  // Rewriting an 84 KB state file to change nothing is a risk taken for no
  // gain: the writer skips the backup-and-write entirely on `changed: false`.
  it('reports no change when the entry it would write is already there', () => {
    const current = JSON.stringify({ other: 1, mcpServers: { [COURSE_COMPANION_SERVER_KEY]: ENTRY } })

    expect(mergeClientConfig(current, 'mcpServers', ENTRY)).toMatchObject({ ok: true, changed: false })
  })

  it('honours a servers key other than mcpServers', () => {
    expect(parse(mergeClientConfig('{}', 'servers', ENTRY))).toEqual({
      servers: { [COURSE_COMPANION_SERVER_KEY]: ENTRY }
    })
  })
})

describe('removeClientConfig', () => {
  it('drops only its own entry and leaves the others standing', () => {
    const existing = JSON.stringify({
      numStartups: 41,
      mcpServers: { engram: { command: 'engram' }, [COURSE_COMPANION_SERVER_KEY]: ENTRY }
    })

    const result = removeClientConfig(existing, 'mcpServers')

    expect(parse(result)).toEqual({ numStartups: 41, mcpServers: { engram: { command: 'engram' } } })
    expect(result).toMatchObject({ changed: true })
  })

  it('reports no change when there is nothing of ours to remove', () => {
    expect(removeClientConfig('{"mcpServers":{"engram":{}}}', 'mcpServers')).toMatchObject({
      ok: true,
      changed: false
    })
  })

  it('reports no change when the file does not exist at all', () => {
    expect(removeClientConfig(null, 'mcpServers')).toMatchObject({ ok: true, changed: false })
  })

  it('leaves an emptied servers key in place rather than deleting it', () => {
    expect(
      parse(removeClientConfig(JSON.stringify({ mcpServers: { [COURSE_COMPANION_SERVER_KEY]: ENTRY } }), 'mcpServers'))
    ).toEqual({
      mcpServers: {}
    })
  })

  // Same fail-closed rule as the merge: an unreadable file is never rewritten.
  it('refuses to rewrite a file it cannot parse', () => {
    expect(removeClientConfig('not json', 'mcpServers')).toEqual({ ok: false, reason: 'unparseable' })
  })
})
