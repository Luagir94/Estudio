import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MCP_ENDPOINT_ENV_VAR, resolveEndpoint } from './endpoint'

function pipeSuffix(username: string): string {
  return createHash('sha256').update(username, 'utf8').digest('hex').slice(0, 16)
}

describe('resolveEndpoint', () => {
  it('derives a win32 pipe name from sha256(username), truncated to the first 16 hex chars', () => {
    const endpoint = resolveEndpoint({ platform: 'win32', username: 'lucia', tmpdir: 'C:\\Temp' })

    expect(endpoint).toBe(`\\\\.\\pipe\\course-companion-mcp-${pipeSuffix('lucia')}`)
  })

  it('derives a different pipe name for a different username (real hash, not a fixture)', () => {
    const first = resolveEndpoint({ platform: 'win32', username: 'alice', tmpdir: 'C:\\Temp' })
    const second = resolveEndpoint({ platform: 'win32', username: 'bob', tmpdir: 'C:\\Temp' })

    expect(first).not.toBe(second)
  })

  it('derives a Unix socket path under tmpdir on a non-win32 platform', () => {
    const endpoint = resolveEndpoint({ platform: 'linux', username: 'lucia', tmpdir: '/tmp' })

    expect(endpoint).toBe(path.join('/tmp', `course-companion-mcp-${pipeSuffix('lucia')}.sock`))
  })

  it('honours the COURSE_COMPANION_MCP_ENDPOINT override over the derived name', () => {
    const override = '\\\\.\\pipe\\test-isolated-endpoint'

    const endpoint = resolveEndpoint({ platform: 'win32', username: 'lucia', tmpdir: 'C:\\Temp', override })

    expect(endpoint).toBe(override)
  })

  it('exports the exact override env var name both the app and the shim read', () => {
    expect(MCP_ENDPOINT_ENV_VAR).toBe('COURSE_COMPANION_MCP_ENDPOINT')
  })

  it('never carries the raw input string into the derived name (threat-matrix: token never in pipe name)', () => {
    const endpoint = resolveEndpoint({ platform: 'win32', username: 'cc_faketoken1234567890', tmpdir: 'C:\\Temp' })

    expect(endpoint).not.toContain('cc_faketoken1234567890')
  })
})
