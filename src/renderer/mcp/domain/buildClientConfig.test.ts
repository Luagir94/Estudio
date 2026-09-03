import { describe, expect, it } from 'vitest'
import { buildClientConfig } from './buildClientConfig'

describe('buildClientConfig', () => {
  it('embeds the shim path and token in the documented { command, args, env } shape', () => {
    const config = buildClientConfig('C:\\app\\resources\\mcp-shim\\index.cjs', 'cc_mcp_abc123')

    expect(JSON.parse(config)).toEqual({
      mcpServers: {
        'course-companion': {
          command: 'node',
          args: ['C:\\app\\resources\\mcp-shim\\index.cjs'],
          env: { COURSE_COMPANION_MCP_TOKEN: 'cc_mcp_abc123' }
        }
      }
    })
  })

  // Triangulation: different inputs must not leak into each other's output.
  it('reflects a different shim path and token without leaking the previous ones', () => {
    const config = buildClientConfig('/repo/out/mcp-shim/index.cjs', 'cc_mcp_rotated456')

    expect(JSON.parse(config)).toEqual({
      mcpServers: {
        'course-companion': {
          command: 'node',
          args: ['/repo/out/mcp-shim/index.cjs'],
          env: { COURSE_COMPANION_MCP_TOKEN: 'cc_mcp_rotated456' }
        }
      }
    })
  })
})
