import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { resolveExecutable, type ExecutableResolverFsPort } from './executableResolver'

// Threat matrix (design D1 / spec "Windows Executable Resolution"): the
// resolver never touches the real filesystem or PATH — everything comes
// through injected `{ env, fs, platform }` ports, so the win32 and POSIX
// branches are both exercisable regardless of the host OS running the test.
describe('resolveExecutable', () => {
  it('walks PATHEXT in order and returns the first extension that resolves (win32)', async () => {
    const probed: string[] = []
    const fs: ExecutableResolverFsPort = {
      access: vi.fn(async (candidate: string) => {
        probed.push(candidate)
        // Only .cmd exists on disk — .com and .exe must be tried and fail first.
        if (!candidate.toLowerCase().endsWith('.cmd')) {
          throw new Error('ENOENT')
        }
      })
    }
    const dir = 'C:\\nvm4w\\nodejs'

    const result = await resolveExecutable('claude', {
      env: { PATH: dir, PATHEXT: '.COM;.EXE;.CMD' },
      fs,
      platform: 'win32'
    })

    expect(result).toBe(path.join(dir, 'claude.cmd'))
    // Proves ordering: .com and .exe were tried BEFORE .cmd succeeded.
    expect(probed).toEqual([path.join(dir, 'claude.com'), path.join(dir, 'claude.exe'), path.join(dir, 'claude.cmd')])
  })

  it('excludes the extension-less POSIX script on win32, never probing it, and resolves claude.cmd', async () => {
    const probed: string[] = []
    const fs: ExecutableResolverFsPort = {
      access: vi.fn(async (candidate: string) => {
        probed.push(candidate)
        if (!candidate.toLowerCase().endsWith('.cmd')) {
          throw new Error('ENOENT')
        }
      })
    }
    // Verified machine: both an extension-less sh script AND claude.cmd
    // live in the same PATH directory (obs #213).
    const dir = 'C:\\nvm4w\\nodejs'

    const result = await resolveExecutable('claude', {
      env: { PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' },
      fs,
      platform: 'win32'
    })

    expect(result).toBe(path.join(dir, 'claude.cmd'))
    expect(probed).not.toContain(path.join(dir, 'claude'))
  })

  it('checks X_OK on an extension-less candidate on POSIX', async () => {
    const modesUsed: (number | undefined)[] = []
    const fs: ExecutableResolverFsPort = {
      access: vi.fn(async (_candidate: string, mode?: number) => {
        modesUsed.push(mode)
      })
    }
    const dir = '/usr/local/bin'

    const result = await resolveExecutable('claude', {
      env: { PATH: dir },
      fs,
      platform: 'linux'
    })

    expect(result).toBe(path.join(dir, 'claude'))
    expect(modesUsed).toHaveLength(1)
    expect(modesUsed[0]).toBeDefined()
  })

  it('returns null without probing the filesystem when PATH is empty', async () => {
    const fs: ExecutableResolverFsPort = {
      access: vi.fn(async () => {})
    }

    const result = await resolveExecutable('claude', {
      env: { PATH: '' },
      fs,
      platform: 'win32'
    })

    expect(result).toBeNull()
    expect(fs.access).not.toHaveBeenCalled()
  })

  it('returns null when no PATH entry yields an accessible candidate', async () => {
    const fs: ExecutableResolverFsPort = {
      access: vi.fn(async () => {
        throw new Error('ENOENT')
      })
    }

    const result = await resolveExecutable('claude', {
      env: { PATH: ['C:\\a', 'C:\\b'].join(';'), PATHEXT: '.EXE;.CMD' },
      fs,
      platform: 'win32'
    })

    expect(result).toBeNull()
  })
})
