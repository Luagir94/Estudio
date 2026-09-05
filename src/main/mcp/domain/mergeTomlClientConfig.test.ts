import { describe, expect, it } from 'vitest'
import { COURSE_COMPANION_SERVER_KEY, type McpServerEntry } from './mergeClientConfig'
import { mergeTomlClientConfig, removeTomlClientConfig } from './mergeTomlClientConfig'

const PREFIX = 'mcp_servers'

const ENTRY: McpServerEntry = {
  command: 'node',
  args: ['C:\\app\\resources\\mcp-shim\\index.cjs'],
  env: { COURSE_COMPANION_MCP_TOKEN: 'cc_mcp_abc123' }
}

const contents = (result: ReturnType<typeof mergeTomlClientConfig>): string => {
  if (!result.ok) {
    throw new Error(`expected a successful merge, got ${result.reason}`)
  }
  return result.contents
}

describe('mergeTomlClientConfig', () => {
  it('creates the whole file when the client has none yet', () => {
    expect(contents(mergeTomlClientConfig(null, PREFIX, ENTRY))).toBe(
      [
        `[${PREFIX}.${COURSE_COMPANION_SERVER_KEY}]`,
        'command = "node"',
        'args = ["C:\\\\app\\\\resources\\\\mcp-shim\\\\index.cjs"]',
        '',
        `[${PREFIX}.${COURSE_COMPANION_SERVER_KEY}.env]`,
        'COURSE_COMPANION_MCP_TOKEN = "cc_mcp_abc123"',
        ''
      ].join('\n')
    )
  })

  it('treats a whitespace-only file as an absent one rather than as malformed', () => {
    expect(contents(mergeTomlClientConfig('  \n\t \n', PREFIX, ENTRY))).toBe(
      contents(mergeTomlClientConfig(null, PREFIX, ENTRY))
    )
  })

  it('escapes a Windows path into a TOML basic string', () => {
    expect(contents(mergeTomlClientConfig(null, PREFIX, ENTRY))).toContain(
      'args = ["C:\\\\app\\\\resources\\\\mcp-shim\\\\index.cjs"]'
    )
  })

  it('omits the env sub-table entirely when there is nothing to put in it', () => {
    const result = contents(mergeTomlClientConfig(null, PREFIX, { command: 'node', args: [], env: {} }))

    expect(result).toContain('args = []')
    expect(result).not.toContain('.env]')
  })

  // The whole reason this module exists instead of a TOML round trip: the
  // student's own comments and formatting above our block have to survive
  // byte for byte.
  it('leaves every byte above our block exactly as found, comments included', () => {
    const existing = [
      '# my own notes, please do not eat them',
      'model = "gpt-5.6-sol"   # trailing comment, odd spacing kept',
      '',
      '[mcp_servers.engram]',
      'command = "engram"',
      'args = [ "mcp", "--tools=agent" ]',
      ''
    ].join('\n')

    const result = contents(mergeTomlClientConfig(existing, PREFIX, ENTRY))

    expect(result.startsWith(existing)).toBe(true)
    expect(result).toContain(`[${PREFIX}.${COURSE_COMPANION_SERVER_KEY}]`)
  })

  it('appends after the last table when the file ends without a trailing newline', () => {
    const existing = '[mcp_servers.engram]\ncommand = "engram"'

    const result = contents(mergeTomlClientConfig(existing, PREFIX, ENTRY))

    expect(result).toContain('[mcp_servers.engram]\ncommand = "engram"\n\n[mcp_servers.course-companion]')
  })

  it('keeps every other server standing', () => {
    const existing = [
      '[mcp_servers.engram]',
      'command = "engram"',
      '',
      '[mcp_servers.context7]',
      'url = "https://x"',
      ''
    ].join('\n')

    const result = contents(mergeTomlClientConfig(existing, PREFIX, ENTRY))

    expect(result).toContain('[mcp_servers.engram]')
    expect(result).toContain('[mcp_servers.context7]')
    expect(result).toContain('url = "https://x"')
  })

  it('replaces a stale block of its OWN in place rather than appending a second one', () => {
    const existing = [
      '[mcp_servers.engram]',
      'command = "engram"',
      '',
      `[${PREFIX}.${COURSE_COMPANION_SERVER_KEY}]`,
      'command = "node"',
      'args = ["C:\\\\old\\\\shim.cjs"]',
      '',
      `[${PREFIX}.${COURSE_COMPANION_SERVER_KEY}.env]`,
      'COURSE_COMPANION_MCP_TOKEN = "cc_mcp_stale"',
      '',
      '[marketplaces.engram]',
      'source_type = "git"',
      ''
    ].join('\n')

    const result = contents(mergeTomlClientConfig(existing, PREFIX, ENTRY))

    expect(result.match(/\[mcp_servers\.course-companion\]/g)).toHaveLength(1)
    expect(result).not.toContain('cc_mcp_stale')
    expect(result).not.toContain('C:\\\\old\\\\shim.cjs')
    expect(result).toContain('cc_mcp_abc123')
    // The block AFTER ours is untouched, which is the part a naive
    // "append at the end" would have got wrong.
    expect(result).toContain('[marketplaces.engram]\nsource_type = "git"')
  })

  it('replaces our block written with a quoted key', () => {
    const existing = [`[${PREFIX}."${COURSE_COMPANION_SERVER_KEY}"]`, 'command = "old"', ''].join('\n')

    const result = contents(mergeTomlClientConfig(existing, PREFIX, ENTRY))

    expect(result).not.toContain('command = "old"')
    expect(result).toContain('command = "node"')
  })

  // Rewriting the student's whole Codex config to change nothing is a risk
  // taken for no gain — the writer skips the backup-and-write on this.
  it('reports no change when the file already says exactly this', () => {
    const once = contents(mergeTomlClientConfig('model = "gpt-5.6-sol"\n', PREFIX, ENTRY))

    expect(mergeTomlClientConfig(once, PREFIX, ENTRY)).toMatchObject({ ok: true, changed: false })
    expect(contents(mergeTomlClientConfig(once, PREFIX, ENTRY))).toBe(once)
  })

  it('reports a change when only the token moved', () => {
    const once = contents(mergeTomlClientConfig(null, PREFIX, ENTRY))

    expect(
      mergeTomlClientConfig(once, PREFIX, { ...ENTRY, env: { COURSE_COMPANION_MCP_TOKEN: 'cc_mcp_rotated' } })
    ).toMatchObject({ ok: true, changed: true })
  })

  // Fail-closed, same rule as the JSON side. These are shapes this app does
  // not understand — and a file we did not understand is a file we must not
  // append to, because our block would become a duplicate key that breaks
  // every other server in it.
  it('refuses when the servers map is one inline table at the root', () => {
    expect(mergeTomlClientConfig('mcp_servers = { engram = { command = "engram" } }\n', PREFIX, ENTRY)).toEqual({
      ok: false,
      reason: 'servers-not-tables'
    })
  })

  it('refuses when the servers map is a single table holding named keys', () => {
    expect(mergeTomlClientConfig('[mcp_servers]\nengram = { command = "engram" }\n', PREFIX, ENTRY)).toEqual({
      ok: false,
      reason: 'servers-not-tables'
    })
  })

  it('honours a table prefix other than mcp_servers', () => {
    expect(contents(mergeTomlClientConfig(null, 'servers', ENTRY))).toContain(
      `[servers.${COURSE_COMPANION_SERVER_KEY}]`
    )
  })
})

describe('removeTomlClientConfig', () => {
  const withOurs = [
    'model = "gpt-5.6-sol"',
    '',
    '[mcp_servers.engram]',
    'command = "engram"',
    '',
    `[${PREFIX}.${COURSE_COMPANION_SERVER_KEY}]`,
    'command = "node"',
    '',
    `[${PREFIX}.${COURSE_COMPANION_SERVER_KEY}.env]`,
    'COURSE_COMPANION_MCP_TOKEN = "cc_mcp_abc123"',
    '',
    '[marketplaces.engram]',
    'source_type = "git"',
    ''
  ].join('\n')

  it('drops our block and its env sub-table, and leaves the others standing', () => {
    const result = contents(removeTomlClientConfig(withOurs, PREFIX))

    expect(result).not.toContain('course-companion')
    expect(result).not.toContain('cc_mcp_abc123')
    expect(result).toContain('[mcp_servers.engram]\ncommand = "engram"')
    expect(result).toContain('[marketplaces.engram]\nsource_type = "git"')
    expect(result).toContain('model = "gpt-5.6-sol"')
  })

  it('reports the removal as a change', () => {
    expect(removeTomlClientConfig(withOurs, PREFIX)).toMatchObject({ ok: true, changed: true })
  })

  it('reports no change when there is nothing of ours to remove', () => {
    const clean = '[mcp_servers.engram]\ncommand = "engram"\n'

    expect(removeTomlClientConfig(clean, PREFIX)).toEqual({ ok: true, contents: clean, changed: false })
  })

  it('reports no change when the file does not exist at all', () => {
    expect(removeTomlClientConfig(null, PREFIX)).toMatchObject({ ok: true, changed: false })
  })

  it('refuses to rewrite a shape it does not understand', () => {
    expect(removeTomlClientConfig('[mcp_servers]\nengram = { command = "engram" }\n', PREFIX)).toEqual({
      ok: false,
      reason: 'servers-not-tables'
    })
  })

  // Register then unregister must leave the student's file the way it was.
  it('round-trips back to the original bytes', () => {
    const original = ['model = "gpt-5.6-sol"', '', '[mcp_servers.engram]', 'command = "engram"', ''].join('\n')

    const registered = contents(mergeTomlClientConfig(original, PREFIX, ENTRY))

    expect(contents(removeTomlClientConfig(registered, PREFIX))).toBe(original)
  })
})
