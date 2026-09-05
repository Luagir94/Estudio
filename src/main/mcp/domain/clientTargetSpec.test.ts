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
      serversKey: 'mcpServers'
    })
  })

  it('resolves nothing for a target this build does not offer', () => {
    expect(targetSpec('cursor' as McpClientTarget)).toBeUndefined()
  })
})
