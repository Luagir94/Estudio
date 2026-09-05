import { describe, expect, it } from 'vitest'
import { ENABLED_MCP_CLIENT_TARGETS, MCP_CLIENT_TARGET_VALUES, type McpClientTarget } from '../../../shared/ipc/mcp'
import { MCP_TARGET_SPECS, targetSpec } from './clientTargetSpec'

describe('MCP_TARGET_SPECS', () => {
  // The two lists live in different layers on purpose (the contract is shared,
  // the paths are main-only), so this is what stops them drifting: enabling a
  // target without giving it a spec would ship a button that resolves no file.
  it('gives every ENABLED target a spec', () => {
    for (const target of ENABLED_MCP_CLIENT_TARGETS) {
      expect(targetSpec(target), `${target} is enabled but has no spec`).toBeDefined()
    }
  })

  // The mirror rule, and the more important one: a spec present for a target
  // that is not enabled would be an unverified path one refactor away from
  // being written to.
  it('gives NO spec to a target that is not enabled', () => {
    const notEnabled = MCP_CLIENT_TARGET_VALUES.filter((target) => !ENABLED_MCP_CLIENT_TARGETS.includes(target))

    expect(notEnabled.length).toBeGreaterThan(0)
    for (const target of notEnabled) {
      expect(targetSpec(target), `${target} is not enabled but carries a spec`).toBeUndefined()
    }
  })

  it('states what was run for every spec it does carry', () => {
    for (const target of MCP_CLIENT_TARGET_VALUES) {
      const spec = MCP_TARGET_SPECS[target]
      if (spec) {
        expect(spec.verified.trim().length, `${target} carries an empty verified note`).toBeGreaterThan(0)
      }
    }
  })

  it('points Claude Code at its user-scope state file and server map', () => {
    expect(targetSpec('claude-code')).toMatchObject({
      configSegments: ['.claude.json'],
      detectSegments: ['.claude'],
      serversKey: 'mcpServers',
      format: 'json'
    })
  })

  // `~/.gemini/` holds three `mcp_config.json` files on a machine that has run
  // both the Antigravity CLI and the IDE, and only `config/` is the one `agy`
  // reads. This test is the guard on that: pointing at either of the other two
  // would write a file the CLI never opens, and nothing else in the suite would
  // notice.
  it('points the Antigravity CLI at the config file agy itself reads', () => {
    expect(targetSpec('antigravity')).toMatchObject({
      configSegments: ['.gemini', 'config', 'mcp_config.json'],
      serversKey: 'mcpServers',
      format: 'json'
    })
  })

  // `.gemini` alone belongs to the Gemini CLI too, so detecting on it would
  // offer to register a client that is not installed.
  it('detects Antigravity on its own state directory rather than on the shared .gemini root', () => {
    expect(targetSpec('antigravity')?.detectSegments).toEqual(['.gemini', 'antigravity-cli'])
  })

  it('points Codex at its TOML config and declares the format that says so', () => {
    expect(targetSpec('codex')).toMatchObject({
      configSegments: ['.codex', 'config.toml'],
      detectSegments: ['.codex'],
      serversKey: 'mcp_servers',
      format: 'toml'
    })
  })

  // The format is what the writer branches on. A row claiming `json` for a file
  // that is not JSON would send the student's config through a parse-and-
  // re-serialise that strips every comment in it.
  it('declares toml only for a config file that is one', () => {
    for (const target of MCP_CLIENT_TARGET_VALUES) {
      const spec = MCP_TARGET_SPECS[target]
      if (!spec) continue

      const isTomlFile = spec.configSegments[spec.configSegments.length - 1]?.endsWith('.toml') === true
      expect(spec.format === 'toml', `${target} declares ${spec.format} for ${spec.configSegments.join('/')}`).toBe(
        isTomlFile
      )
    }
  })

  it('resolves nothing for a target this build does not offer', () => {
    expect(targetSpec('cursor' as McpClientTarget)).toBeUndefined()
  })
})
