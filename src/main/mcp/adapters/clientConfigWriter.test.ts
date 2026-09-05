import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildServerEntry } from '../../../shared/ipc/mcp'
import { COURSE_COMPANION_SERVER_KEY } from '../domain/mergeClientConfig'
import { createClientConfigWriter } from './clientConfigWriter'

const HOME = path.join('C:', 'Users', 'lucia')
const CONFIG = path.join(HOME, '.claude.json')
const BACKUP = `${CONFIG}.course-companion-backup`
const TEMP = `${CONFIG}.course-companion.tmp`
const ENTRY = buildServerEntry('C:\\app\\resources\\mcp-shim\\index.cjs', 'cc_mcp_abc123')

const AGY_CONFIG = path.join(HOME, '.gemini', 'config', 'mcp_config.json')
const AGY_DIR = path.join(HOME, '.gemini', 'antigravity-cli')
const CODEX_CONFIG = path.join(HOME, '.codex', 'config.toml')
const CODEX_DIR = path.join(HOME, '.codex')

const enoent = (): NodeJS.ErrnoException => Object.assign(new Error('not found'), { code: 'ENOENT' })

/** In-memory disk: file path to contents. A missing key is a missing file. */
function makeFs(initial: Record<string, string> = {}, dirs: readonly string[] = [path.join(HOME, '.claude')]) {
  const files = new Map(Object.entries(initial))
  const directories = new Set(dirs)

  return {
    files,
    readFile: vi.fn(async (filePath: string) => {
      const found = files.get(filePath)
      if (found === undefined) throw enoent()
      return found
    }),
    writeFile: vi.fn(async (filePath: string, data: string) => {
      files.set(filePath, data)
    }),
    rename: vi.fn(async (from: string, to: string) => {
      const data = files.get(from)
      if (data === undefined) throw enoent()
      files.delete(from)
      files.set(to, data)
    }),
    copyFile: vi.fn(async (from: string, to: string) => {
      const data = files.get(from)
      if (data === undefined) throw enoent()
      files.set(to, data)
    }),
    directoryExists: vi.fn(async (dirPath: string) => directories.has(dirPath))
  }
}

const build = (fs: ReturnType<typeof makeFs>) =>
  createClientConfigWriter({
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    rename: fs.rename,
    copyFile: fs.copyFile,
    directoryExists: fs.directoryExists,
    homedir: () => HOME,
    logger: { info: vi.fn(), error: vi.fn() }
  })

/** The row for one target out of a listing, so a test can assert on the client it is about. */
const rowFor = async (fs: ReturnType<typeof makeFs>, target: string): Promise<Record<string, unknown> | undefined> =>
  (await build(fs).list()).find((row) => row.target === target) as Record<string, unknown> | undefined

describe('clientConfigWriter.list', () => {
  it('lists every enabled target, in the order the contract enables them', async () => {
    expect((await build(makeFs()).list()).map((row) => row.target)).toEqual(['claude-code', 'antigravity', 'codex'])
  })

  it('reports a detected client with our entry already present as connected', async () => {
    const fs = makeFs({ [CONFIG]: JSON.stringify({ mcpServers: { [COURSE_COMPANION_SERVER_KEY]: ENTRY } }) })

    expect(await rowFor(fs, 'claude-code')).toEqual({
      target: 'claude-code',
      configPath: CONFIG,
      detected: true,
      connected: true
    })
  })

  it('reports detected-but-not-connected when the client is installed and we are not in it', async () => {
    const fs = makeFs({ [CONFIG]: JSON.stringify({ mcpServers: { engram: {} } }) })

    expect(await rowFor(fs, 'claude-code')).toMatchObject({ detected: true, connected: false })
  })

  it('reports a client that is not installed at all', async () => {
    expect(await rowFor(makeFs({}, []), 'claude-code')).toMatchObject({ detected: false, connected: false })
  })

  // Listing must never throw: the settings screen has to render even when the
  // client's own file is broken, and the WRITE is where that gets reported.
  it('reports not-connected rather than failing when the file cannot be parsed', async () => {
    const fs = makeFs({ [CONFIG]: 'not json at all' })

    expect(await rowFor(fs, 'claude-code')).toMatchObject({ detected: true, connected: false })
  })

  it('resolves the Antigravity CLI at its own config file, not at the Gemini CLI directory', async () => {
    const fs = makeFs({}, [AGY_DIR])

    expect(await rowFor(fs, 'antigravity')).toEqual({
      target: 'antigravity',
      configPath: AGY_CONFIG,
      detected: true,
      connected: false
    })
  })

  it('reads Codex connection out of its TOML file rather than trying to parse it as JSON', async () => {
    const fs = makeFs(
      { [CODEX_CONFIG]: `model = "gpt-5.6-sol"\n\n[mcp_servers.${COURSE_COMPANION_SERVER_KEY}]\ncommand = "node"\n` },
      [CODEX_DIR]
    )

    expect(await rowFor(fs, 'codex')).toEqual({
      target: 'codex',
      configPath: CODEX_CONFIG,
      detected: true,
      connected: true
    })
  })

  it('reports Codex as not connected when only other servers are in its file', async () => {
    const fs = makeFs({ [CODEX_CONFIG]: '[mcp_servers.engram]\ncommand = "engram"\n' }, [CODEX_DIR])

    expect(await rowFor(fs, 'codex')).toMatchObject({ detected: true, connected: false })
  })
})

describe('clientConfigWriter.write', () => {
  it('creates the config file when the client has none yet', async () => {
    const fs = makeFs()

    const outcome = await build(fs).write('claude-code', ENTRY)

    expect(outcome).toMatchObject({ ok: true, result: { changed: true, backupPath: null, configPath: CONFIG } })
    expect(JSON.parse(fs.files.get(CONFIG) as string)).toEqual({
      mcpServers: { [COURSE_COMPANION_SERVER_KEY]: ENTRY }
    })
  })

  it('backs the previous file up before overwriting it', async () => {
    const existing = JSON.stringify({ numStartups: 41, mcpServers: { engram: { command: 'engram' } } })
    const fs = makeFs({ [CONFIG]: existing })

    const outcome = await build(fs).write('claude-code', ENTRY)

    expect(outcome).toMatchObject({ ok: true, result: { backupPath: BACKUP } })
    expect(fs.files.get(BACKUP)).toBe(existing)
  })

  it('keeps the unrelated top-level keys and the other servers', async () => {
    const fs = makeFs({
      [CONFIG]: JSON.stringify({ numStartups: 41, mcpServers: { engram: { command: 'engram' } } })
    })

    await build(fs).write('claude-code', ENTRY)

    expect(JSON.parse(fs.files.get(CONFIG) as string)).toEqual({
      numStartups: 41,
      mcpServers: { engram: { command: 'engram' }, [COURSE_COMPANION_SERVER_KEY]: ENTRY }
    })
  })

  // Never leave a half-written state file behind: write a temporary sibling
  // and rename it over the target in one step.
  it('writes through a temporary file and renames it into place', async () => {
    const fs = makeFs()

    await build(fs).write('claude-code', ENTRY)

    expect(fs.writeFile).toHaveBeenCalledWith(TEMP, expect.any(String))
    expect(fs.rename).toHaveBeenCalledWith(TEMP, CONFIG)
  })

  it('does not back up or rewrite anything when the file already says exactly this', async () => {
    const fs = makeFs({
      [CONFIG]: `${JSON.stringify({ mcpServers: { [COURSE_COMPANION_SERVER_KEY]: ENTRY } }, null, 2)}\n`
    })

    const outcome = await build(fs).write('claude-code', ENTRY)

    expect(outcome).toMatchObject({ ok: true, result: { changed: false, backupPath: null } })
    expect(fs.copyFile).not.toHaveBeenCalled()
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('refuses, without writing, when the existing file cannot be parsed', async () => {
    const fs = makeFs({ [CONFIG]: '{ "mcpServers": ' })

    expect(await build(fs).write('claude-code', ENTRY)).toMatchObject({ ok: false, code: 'CONFIG_NOT_UNDERSTOOD' })
    expect(fs.writeFile).not.toHaveBeenCalled()
    expect(fs.copyFile).not.toHaveBeenCalled()
  })

  it('refuses when the file exists but cannot be read at all', async () => {
    const fs = makeFs()
    fs.readFile.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }))

    expect(await build(fs).write('claude-code', ENTRY)).toMatchObject({ ok: false, code: 'CONFIG_UNREADABLE' })
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('refuses a target this build does not offer', async () => {
    expect(await build(makeFs()).write('cursor', ENTRY)).toMatchObject({ ok: false, code: 'TARGET_NOT_OFFERED' })
  })
})

describe('clientConfigWriter.remove', () => {
  let fs: ReturnType<typeof makeFs>

  beforeEach(() => {
    fs = makeFs({
      [CONFIG]: JSON.stringify({
        numStartups: 41,
        mcpServers: { engram: { command: 'engram' }, [COURSE_COMPANION_SERVER_KEY]: ENTRY }
      })
    })
  })

  it('drops our entry and leaves everything else standing', async () => {
    const outcome = await build(fs).remove('claude-code')

    expect(outcome).toMatchObject({ ok: true, result: { changed: true } })
    expect(JSON.parse(fs.files.get(CONFIG) as string)).toEqual({
      numStartups: 41,
      mcpServers: { engram: { command: 'engram' } }
    })
  })

  it('backs up before removing, same as a write', async () => {
    await build(fs).remove('claude-code')

    expect(fs.copyFile).toHaveBeenCalledWith(CONFIG, BACKUP)
  })

  it('touches nothing when there is no entry of ours to remove', async () => {
    const clean = makeFs({ [CONFIG]: JSON.stringify({ mcpServers: { engram: {} } }) })

    expect(await build(clean).remove('claude-code')).toMatchObject({ ok: true, result: { changed: false } })
    expect(clean.writeFile).not.toHaveBeenCalled()
  })

  it('touches nothing when the client has no config file at all', async () => {
    const empty = makeFs()

    expect(await build(empty).remove('claude-code')).toMatchObject({ ok: true, result: { changed: false } })
    expect(empty.writeFile).not.toHaveBeenCalled()
  })
})

// Codex is the one TOML target, and the whole reason it is served by a
// surgical block edit rather than by the JSON merge: these assert at the
// WRITER level what `mergeTomlClientConfig.test.ts` asserts purely — that the
// student's own file comes back with our table added and nothing else moved.
describe('clientConfigWriter on a TOML client', () => {
  const CODEX_BACKUP = `${CODEX_CONFIG}.course-companion-backup`
  const CODEX_TEMP = `${CODEX_CONFIG}.course-companion.tmp`

  const existing = [
    '# my own notes',
    'model = "gpt-5.6-sol"',
    '',
    '[mcp_servers.engram]',
    'command = "engram"',
    'args = [ "mcp", "--tools=agent" ]',
    ''
  ].join('\n')

  it('adds our table and leaves the comments and the other servers untouched', async () => {
    const fs = makeFs({ [CODEX_CONFIG]: existing }, [CODEX_DIR])

    const outcome = await build(fs).write('codex', ENTRY)

    expect(outcome).toMatchObject({ ok: true, result: { changed: true, configPath: CODEX_CONFIG } })
    const written = fs.files.get(CODEX_CONFIG) as string
    expect(written.startsWith(existing)).toBe(true)
    expect(written).toContain(`[mcp_servers.${COURSE_COMPANION_SERVER_KEY}]`)
    expect(written).toContain('cc_mcp_abc123')
  })

  it('creates the file when Codex has no config yet', async () => {
    const fs = makeFs({}, [CODEX_DIR])

    const outcome = await build(fs).write('codex', ENTRY)

    expect(outcome).toMatchObject({ ok: true, result: { changed: true, backupPath: null } })
    expect(fs.files.get(CODEX_CONFIG)).toContain(`[mcp_servers.${COURSE_COMPANION_SERVER_KEY}]`)
  })

  it('backs up and writes through a temporary file, same as the JSON path', async () => {
    const fs = makeFs({ [CODEX_CONFIG]: existing }, [CODEX_DIR])

    await build(fs).write('codex', ENTRY)

    expect(fs.copyFile).toHaveBeenCalledWith(CODEX_CONFIG, CODEX_BACKUP)
    expect(fs.rename).toHaveBeenCalledWith(CODEX_TEMP, CODEX_CONFIG)
  })

  it('does not rewrite the file when it already says exactly this', async () => {
    const fs = makeFs({ [CODEX_CONFIG]: existing }, [CODEX_DIR])
    await build(fs).write('codex', ENTRY)
    const settled = fs.files.get(CODEX_CONFIG) as string

    const second = makeFs({ [CODEX_CONFIG]: settled }, [CODEX_DIR])
    const outcome = await build(second).write('codex', ENTRY)

    expect(outcome).toMatchObject({ ok: true, result: { changed: false, backupPath: null } })
    expect(second.writeFile).not.toHaveBeenCalled()
  })

  it('register then unregister lands back on the original bytes', async () => {
    const fs = makeFs({ [CODEX_CONFIG]: existing }, [CODEX_DIR])

    await build(fs).write('codex', ENTRY)
    await build(fs).remove('codex')

    expect(fs.files.get(CODEX_CONFIG)).toBe(existing)
  })

  // Fail closed: a shape we cannot edit surgically would take every OTHER
  // server in the file down with it if we appended anyway.
  it('refuses, without writing, when the servers map is one flat table', async () => {
    const fs = makeFs({ [CODEX_CONFIG]: '[mcp_servers]\nengram = { command = "engram" }\n' }, [CODEX_DIR])

    expect(await build(fs).write('codex', ENTRY)).toMatchObject({ ok: false, code: 'CONFIG_NOT_UNDERSTOOD' })
    expect(fs.writeFile).not.toHaveBeenCalled()
    expect(fs.copyFile).not.toHaveBeenCalled()
  })
})

describe('clientConfigWriter on the Antigravity CLI', () => {
  it('writes the exact entry shape agy reads back, into its own config file', async () => {
    const fs = makeFs({}, [AGY_DIR])

    const outcome = await build(fs).write('antigravity', ENTRY)

    expect(outcome).toMatchObject({ ok: true, result: { changed: true, configPath: AGY_CONFIG } })
    expect(JSON.parse(fs.files.get(AGY_CONFIG) as string)).toEqual({
      mcpServers: { [COURSE_COMPANION_SERVER_KEY]: ENTRY }
    })
  })

  it('keeps the servers the student registered by hand', async () => {
    const fs = makeFs({ [AGY_CONFIG]: JSON.stringify({ mcpServers: { context7: { serverUrl: 'https://x' } } }) }, [
      AGY_DIR
    ])

    await build(fs).write('antigravity', ENTRY)

    expect(JSON.parse(fs.files.get(AGY_CONFIG) as string)).toEqual({
      mcpServers: { context7: { serverUrl: 'https://x' }, [COURSE_COMPANION_SERVER_KEY]: ENTRY }
    })
  })

  it('drops only our entry on remove', async () => {
    const fs = makeFs(
      {
        [AGY_CONFIG]: JSON.stringify({
          mcpServers: { context7: { serverUrl: 'https://x' }, [COURSE_COMPANION_SERVER_KEY]: ENTRY }
        })
      },
      [AGY_DIR]
    )

    await build(fs).remove('antigravity')

    expect(JSON.parse(fs.files.get(AGY_CONFIG) as string)).toEqual({
      mcpServers: { context7: { serverUrl: 'https://x' } }
    })
  })
})
