import type { ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  clearProvider,
  MAX_ARGV_PROMPT_CHARS,
  spawnPromptExecution,
  spawnStreamingSession,
  spawnVersionProbe,
  terminateSpawnedProcess,
  validateArgvPrompt,
  validateExecutableCandidate,
  validateModelId,
  type ClearedProvider,
  type SpawnFn,
  type ValidatedArgvPrompt,
  type ValidatedExecutablePath,
  type ValidatedModelId,
  type ValidatorFsPort
} from './claudeExecutableValidator'

// Threat matrix (design D2/D3 / spec "Safe Spawn Vector", "Pre-Spawn
// Validation"): this module is the sole `child_process` import in the
// codebase (enforced by the dependency guard in
// `tooling/dependencyGuard.mts`, proven in `tooling/dependencyGuard.test.ts`).
// Unit tests never touch a real filesystem or a real process — everything
// comes through injected `fs`/`spawnFn` doubles, mirroring
// `campusUrlValidator.test.ts` and `executableResolver.test.ts`.
//
// `validateExecutableCandidate` returns a branded `ValidatedExecutablePath`
// (or `null`) rather than a boolean — the brand lets `spawnVersionProbe`'s
// parameter type enforce "validate before spawn" at compile time.
describe('validateExecutableCandidate', () => {
  it('rejects a relative path without touching the filesystem', async () => {
    const stat = vi.fn()
    const fs: ValidatorFsPort = { stat, access: vi.fn() }

    const result = await validateExecutableCandidate('claude.exe', { fs, platform: 'win32' })

    expect(result).toBeNull()
    expect(stat).not.toHaveBeenCalled()
  })

  it('rejects a path that does not exist', async () => {
    const fs: ValidatorFsPort = {
      stat: vi.fn(async () => {
        throw new Error('ENOENT')
      }),
      access: vi.fn()
    }

    const result = await validateExecutableCandidate('C:\\tools\\claude.exe', { fs, platform: 'win32' })

    expect(result).toBeNull()
  })

  it('rejects a directory', async () => {
    const fs: ValidatorFsPort = {
      stat: vi.fn(async () => ({ isFile: () => false })),
      access: vi.fn()
    }

    const result = await validateExecutableCandidate('C:\\tools\\claude', { fs, platform: 'win32' })

    expect(result).toBeNull()
  })

  it('rejects a .txt file (not a runnable extension on Windows)', async () => {
    const fs: ValidatorFsPort = {
      stat: vi.fn(async () => ({ isFile: () => true })),
      access: vi.fn()
    }

    const result = await validateExecutableCandidate('C:\\tools\\claude.txt', { fs, platform: 'win32' })

    expect(result).toBeNull()
  })

  it('rejects a path containing a quote without touching the filesystem', async () => {
    const stat = vi.fn()
    const fs: ValidatorFsPort = { stat, access: vi.fn() }

    const result = await validateExecutableCandidate('C:\\tools\\cla"ude.exe', { fs, platform: 'win32' })

    expect(result).toBeNull()
    expect(stat).not.toHaveBeenCalled()
  })

  it('rejects a path containing a percent sign without touching the filesystem', async () => {
    const stat = vi.fn()
    const fs: ValidatorFsPort = { stat, access: vi.fn() }

    const result = await validateExecutableCandidate('C:\\tools\\clau%de.exe', { fs, platform: 'win32' })

    expect(result).toBeNull()
    expect(stat).not.toHaveBeenCalled()
  })

  it('rejects a path containing a newline without touching the filesystem', async () => {
    const stat = vi.fn()
    const fs: ValidatorFsPort = { stat, access: vi.fn() }

    const result = await validateExecutableCandidate('C:\\tools\\clau\nde.exe', { fs, platform: 'win32' })

    expect(result).toBeNull()
    expect(stat).not.toHaveBeenCalled()
  })

  it('accepts an absolute .cmd file with a runnable extension on Windows, resolving to the input path', async () => {
    const fs: ValidatorFsPort = {
      stat: vi.fn(async () => ({ isFile: () => true })),
      access: vi.fn()
    }
    const absPath = 'C:\\nvm4w\\nodejs\\claude.cmd'

    const result = await validateExecutableCandidate(absPath, { fs, platform: 'win32' })

    expect(result).toBe(absPath)
  })

  it('accepts an absolute extension-less file that passes X_OK on POSIX, resolving to the input path', async () => {
    const access = vi.fn(async () => {})
    const fs: ValidatorFsPort = {
      stat: vi.fn(async () => ({ isFile: () => true })),
      access
    }
    const absPath = '/usr/local/bin/claude'

    const result = await validateExecutableCandidate(absPath, { fs, platform: 'linux' })

    expect(result).toBe(absPath)
    expect(access).toHaveBeenCalledTimes(1)
  })

  it('rejects an absolute file on POSIX that fails X_OK', async () => {
    const fs: ValidatorFsPort = {
      stat: vi.fn(async () => ({ isFile: () => true })),
      access: vi.fn(async () => {
        throw new Error('EACCES')
      })
    }

    const result = await validateExecutableCandidate('/usr/local/bin/claude', { fs, platform: 'linux' })

    expect(result).toBeNull()
  })
})

// Compile-time guarantee (review finding, closed on this branch):
// `spawnVersionProbe` must reject a plain `string` at the type level,
// because the `.cmd`/`.bat` vector's safety rests entirely on
// `UNSAFE_PATH_PATTERN` having already run inside
// `validateExecutableCandidate`. This is the RED test for that type-level
// constraint — if the brand is ever widened back to `string`, `npm run
// typecheck` fails even though every runtime test above stays green.
describe('spawnVersionProbe — compile-time validation ordering', () => {
  it('rejects a plain string at the type level (see @ts-expect-error below)', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)
    const unvalidatedPath = 'C:\\tools\\claude.exe'

    // @ts-expect-error — a plain `string` is not a `ValidatedExecutablePath`;
    // only `validateExecutableCandidate`'s return value may be passed here.
    spawnVersionProbe(unvalidatedPath, spawnFn)

    expect(spawnFn).toHaveBeenCalled()
  })
})

// Stands in for a `validateExecutableCandidate` call the suite above already covers.
function asValidated(candidatePath: string): ValidatedExecutablePath {
  return candidatePath as ValidatedExecutablePath
}

describe('spawnVersionProbe', () => {
  it('spawns a .cmd shim through the cmd.exe /d /s /c vector with shell:false', () => {
    vi.stubEnv('ComSpec', 'C:\\Windows\\System32\\cmd.exe')
    const spawnFn = vi.fn(() => ({}) as ChildProcess)
    const absPath = 'C:\\nvm4w\\nodejs\\claude.cmd'

    spawnVersionProbe(asValidated(absPath), spawnFn)

    expect(spawnFn).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\cmd.exe',
      ['/d', '/s', '/c', '""C:\\nvm4w\\nodejs\\claude.cmd" --version"'],
      { windowsVerbatimArguments: true, shell: false }
    )
    vi.unstubAllEnvs()
  })

  // Asserting the argv shape proves the string was built as designed. It does
  // NOT prove the design works: cmd.exe with /S strips the first and last
  // quote on the line, so a path with a space lost its quoting and the probe
  // failed for every user whose executable lives under e.g. `C:\Program
  // Files\`. This is the only test that would have caught it, so it runs the
  // real vector against a real shim instead of inspecting arguments.
  it.runIf(process.platform === 'win32')(
    'runs a real .cmd shim whose path contains a space, a parenthesis and an ampersand',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'claude-probe-'))
      const awkward = join(directory, 'Program Files (x86)', 'Foo & Bar')
      await mkdir(awkward, { recursive: true })
      const shim = join(awkward, 'fake.cmd')
      await writeFile(shim, '@echo off\r\necho FAKE-VERSION 9.9.9\r\n')

      const child = spawnVersionProbe(asValidated(shim))
      const stdout = await new Promise<string>((resolve, reject) => {
        let buffer = ''
        child.stdout?.on('data', (chunk) => (buffer += chunk))
        child.on('error', reject)
        child.on('close', () => resolve(buffer.trim()))
      })

      expect(stdout).toBe('FAKE-VERSION 9.9.9')
      await rm(directory, { recursive: true, force: true })
    }
  )

  it('falls back to a bare cmd.exe command when ComSpec is unset', () => {
    vi.stubEnv('ComSpec', undefined)
    const spawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnVersionProbe(asValidated('C:\\nvm4w\\nodejs\\claude.bat'), spawnFn)

    expect(spawnFn).toHaveBeenCalledWith('cmd.exe', expect.any(Array), expect.objectContaining({ shell: false }))
    vi.unstubAllEnvs()
  })

  it('spawns a non-shim executable directly with the fixed --version vector and shell:false', () => {
    const spawnFn = vi.fn(() => ({}) as ChildProcess)
    const absPath = 'C:\\tools\\claude.exe'

    spawnVersionProbe(asValidated(absPath), spawnFn)

    expect(spawnFn).toHaveBeenCalledWith(absPath, ['--version'], { shell: false })
  })

  it('never sets shell:true for any candidate', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnVersionProbe(asValidated('C:\\tools\\claude.cmd'), spawnFn)
    spawnVersionProbe(asValidated('C:\\tools\\claude.exe'), spawnFn)

    for (const call of vi.mocked(spawnFn).mock.calls) {
      const [, , options] = call
      expect(options.shell).toBe(false)
    }
  })
})

// The SECOND sanctioned invocation (design D1/D2). Same trust boundary and
// same cmd.exe vector as the probe, but a different fixed argv template —
// and one extra app-computed value, `attachmentsRoot`, which reaches the
// cmd.exe command string on the shim branch. That is exactly why this
// function re-asserts `UNSAFE_PATH_PATTERN` on the root and THROWS: an
// invalid root is an app-invariant breach, never a silent fallback.
const ATTACHMENTS_ROOT = 'C:\\Users\\testuser\\AppData\\Roaming\\course-companion\\attachments'

/** Claude's template was verified against a real binary, so it clears statically. */
const CLAUDE = clearProvider('claude', null) as ClearedProvider

/** Mirrors `asValidated`: mints the model brand through the real gate. */
const asModel = (id: string): ValidatedModelId => validateModelId(id) as ValidatedModelId

describe('spawnPromptExecution', () => {
  it('spawns a non-shim executable with the fixed print-mode vector, cwd and piped stdio', () => {
    const spawnFn = vi.fn(() => ({}) as ChildProcess)
    const absPath = 'C:\\tools\\claude.exe'

    spawnPromptExecution(CLAUDE, asValidated(absPath), ATTACHMENTS_ROOT, asModel('claude-sonnet-5'), spawnFn)

    expect(spawnFn).toHaveBeenCalledWith(
      absPath,
      [
        '-p',
        '--safe-mode',
        '--strict-mcp-config',
        '--exclude-dynamic-system-prompt-sections',
        '--output-format',
        'json',
        '--allowed-tools',
        'Read,Glob,Grep',
        '--model',
        'claude-sonnet-5',
        '--add-dir',
        ATTACHMENTS_ROOT
      ],
      { shell: false, cwd: ATTACHMENTS_ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
    )
  })

  it('spawns a .cmd shim through the cmd.exe /d /s /c vector, quoting both the path and the root', () => {
    vi.stubEnv('ComSpec', 'C:\\Windows\\System32\\cmd.exe')
    const spawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnPromptExecution(
      CLAUDE,
      asValidated('C:\\nvm4w\\nodejs\\claude.cmd'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )

    expect(spawnFn).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\cmd.exe',
      [
        '/d',
        '/s',
        '/c',
        `""C:\\nvm4w\\nodejs\\claude.cmd" -p --safe-mode --strict-mcp-config --exclude-dynamic-system-prompt-sections --output-format json --allowed-tools Read,Glob,Grep --model claude-sonnet-5 --add-dir "${ATTACHMENTS_ROOT}""`
      ],
      { shell: false, cwd: ATTACHMENTS_ROOT, stdio: ['pipe', 'pipe', 'pipe'], windowsVerbatimArguments: true }
    )
    vi.unstubAllEnvs()
  })

  // The outer quote pair absorbs cmd.exe's `/S` strip (see the probe's
  // comment). A root under `C:\Users\...\AppData` is space-free, but a
  // roaming profile or a renamed user folder is not — this is the case that
  // silently broke the probe once already.
  it('keeps the root quoted on the shim branch when it contains a space', () => {
    vi.stubEnv('ComSpec', 'cmd.exe')
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)
    const spacedRoot = 'C:\\Users\\Ana Maria\\AppData\\attachments'

    spawnPromptExecution(
      CLAUDE,
      asValidated('C:\\nvm4w\\nodejs\\claude.cmd'),
      spacedRoot,
      asModel('claude-sonnet-5'),
      spawnFn
    )

    const [, args] = vi.mocked(spawnFn).mock.calls[0]
    expect(args[3]).toContain(`--add-dir "${spacedRoot}"`)
    vi.unstubAllEnvs()
  })

  it('passes the read-only tool allowlist as one comma-separated token on both branches', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnPromptExecution(
      CLAUDE,
      asValidated('C:\\tools\\claude.exe'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )
    spawnPromptExecution(
      CLAUDE,
      asValidated('C:\\tools\\claude.cmd'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )

    const [directCall, shimCall] = vi.mocked(spawnFn).mock.calls
    expect(directCall[1]).toContain('Read,Glob,Grep')
    expect(shimCall[1][3]).toContain('--allowed-tools Read,Glob,Grep')
  })

  // Containment under global scope rests on the allowlist plus print mode's
  // auto-denial. This flag would defeat both at once.
  it('never passes --dangerously-skip-permissions on either branch', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnPromptExecution(
      CLAUDE,
      asValidated('C:\\tools\\claude.exe'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )
    spawnPromptExecution(
      CLAUDE,
      asValidated('C:\\tools\\claude.cmd'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )

    for (const [, args] of vi.mocked(spawnFn).mock.calls) {
      expect(args.join(' ')).not.toContain('--dangerously-skip-permissions')
    }
  })

  // Startup isolation (perf). Every question pays the CLI's full cold start,
  // and that start also loads the USER's own Claude Code setup — CLAUDE.md,
  // hooks, plugins, skills, MCP servers — none of which this read-only,
  // single-turn invocation can reach. `--safe-mode` disables all of it while
  // auth, model selection, built-in tools and permissions keep working;
  // `--strict-mcp-config` states the empty MCP set at the boundary instead of
  // inheriting it from safe mode's scope; and
  // `--exclude-dynamic-system-prompt-sections` keeps the system-prompt prefix
  // identical across spawns so it stays cacheable.
  //
  // `--bare` is deliberately NOT here: its own contract makes auth strictly
  // `ANTHROPIC_API_KEY`/`apiKeyHelper` and never reads OAuth or the keychain
  // — which is exactly the credential the app's users sign in with.
  it('isolates the spawn from the user global config on both branches', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnPromptExecution(
      CLAUDE,
      asValidated('C:\tools\claude.exe'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )
    spawnPromptExecution(
      CLAUDE,
      asValidated('C:\tools\claude.cmd'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )

    const [directCall, shimCall] = vi.mocked(spawnFn).mock.calls
    for (const flag of ['--safe-mode', '--strict-mcp-config', '--exclude-dynamic-system-prompt-sections']) {
      expect(directCall[1]).toContain(flag)
      expect(shimCall[1][3]).toContain(flag)
    }
    // No `--mcp-config` at all — that absence is what makes the strict flag
    // resolve to an EMPTY server set instead of a narrowed one.
    expect(directCall[1]).not.toContain('--mcp-config')
    expect(shimCall[1][3]).not.toContain(' --mcp-config')
  })

  // The old three-key allowlist table is gone: no CLI of the three can
  // enumerate the models an account actually has, so a fixed table could only
  // ever go stale. What keeps a free model id as safe as that table was is the
  // character WHITELIST — every character that could break out of the cmd.exe
  // vector is excluded by construction, so these are the only shapes that can
  // reach a command line at all.
  it.each([
    'claude-sonnet-5',
    'claude-haiku-4-5-20251001',
    'sonnet',
    'gemini-2.5-pro',
    'gpt-5-codex',
    'o3',
    // The context-window variants the CLI's own state file names. Discovered
    // ids carry them, so a gate that refused these would offer the user a
    // model it then refused to spawn.
    'claude-opus-5[1m]',
    'claude-fable-5[1m]',
    'claude-sonnet-5[200k]'
  ])('carries the validated model id %s through to both branches', (modelId) => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnPromptExecution(CLAUDE, asValidated('C:\\tools\\claude.exe'), ATTACHMENTS_ROOT, asModel(modelId), spawnFn)
    spawnPromptExecution(CLAUDE, asValidated('C:\\tools\\claude.cmd'), ATTACHMENTS_ROOT, asModel(modelId), spawnFn)

    const [directCall, shimCall] = vi.mocked(spawnFn).mock.calls
    expect(directCall[1]).toEqual(expect.arrayContaining(['--model', modelId]))
    expect(shimCall[1][3]).toContain(`--model ${modelId}`)
  })

  // The gate itself. Everything here would break out of, or confuse, the
  // `cmd.exe /d /s /c` command line the shim branch composes — and a leading
  // hyphen would be read as another flag rather than as a model name.
  it.each([
    ['a quote', 'claude"5'],
    ['a percent sign', 'claude%PATH%'],
    ['a space', 'claude sonnet'],
    ['an ampersand', 'claude&whoami'],
    ['a pipe', 'claude|whoami'],
    ['a redirect', 'claude>out'],
    ['a caret', 'claude^5'],
    ['a backtick', 'claude`5'],
    ['a newline', 'claude\nsonnet'],
    ['a leading hyphen', '--dangerously-skip-permissions'],
    ['a path separator', 'claude/sonnet'],
    ['an empty id', ''],
    ['an over-long id', 'a'.repeat(65)],
    // The bracket suffix is a CLOSED shape, not an opening in the whitelist:
    // brackets are legal ONLY as a trailing context-window marker.
    ['a bracket mid-id', 'claude[a]5'],
    ['a suffix that is not a context window', 'claude-opus-5[beta]'],
    ['a suffix with trailing text', 'claude-opus-5[1m]x'],
    ['a bare suffix', '[1m]'],
    ['an unclosed suffix', 'claude-opus-5[1m'],
    ['a stray closing bracket', 'claude-opus-511m]']
  ])('refuses to mint a model brand for %s', (_label, hostileId) => {
    expect(validateModelId(hostileId)).toBeNull()
  })

  it.each([
    ['a relative root', 'attachments'],
    ['a root containing a quote', 'C:\\att"achments'],
    ['a root containing a percent sign', 'C:\\att%achments'],
    ['a root containing a newline', 'C:\\att\nachments']
  ])('throws on %s without spawning anything', (_label, hostileRoot) => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    expect(() =>
      spawnPromptExecution(
        CLAUDE,
        asValidated('C:\\tools\\claude.exe'),
        hostileRoot,
        asModel('claude-sonnet-5'),
        spawnFn
      )
    ).toThrow(/attachments root/i)
    expect(spawnFn).not.toHaveBeenCalled()
  })

  it('rejects a plain string path at the type level (see @ts-expect-error below)', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnPromptExecution(
      CLAUDE,
      // @ts-expect-error — the brand gates this spawn exactly as it gates the probe.
      'C:\\tools\\claude.exe',
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )

    expect(spawnFn).toHaveBeenCalled()
  })
})

// --- argv prompt delivery ----------------------------------------------------
//
// Antigravity is the one provider whose question CANNOT travel on stdin.
// Verified against agy.exe 1.1.15: `--print` is a required-VALUE flag that
// never reads the prompt from stdin, `--print ""` is an error, and a `--print`
// with no value is a usage error. So the question becomes an argv element —
// and every guarantee stdin gave away for free has to be re-established here.

/** Antigravity's template was verified against agy.exe 1.1.15, so it clears statically. */
const ANTIGRAVITY = clearProvider('antigravity', null) as ClearedProvider

/** Mirrors `asModel`: mints the prompt brand through the real gate. */
const asPrompt = (text: string): ValidatedArgvPrompt => validateArgvPrompt(text) as ValidatedArgvPrompt

describe('validateArgvPrompt', () => {
  // Windows caps a whole command line near 32767 characters, and the rest of
  // argv — the executable path, the flags, the model id, the attachments root —
  // has to fit alongside the question. The ceiling is deliberately well under
  // it rather than exactly at it.
  it('leaves room on the command line for the rest of the vector', () => {
    expect(MAX_ARGV_PROMPT_CHARS).toBeLessThan(32767)
  })

  it('mints a brand for a prompt exactly at the ceiling', () => {
    const atLimit = 'x'.repeat(MAX_ARGV_PROMPT_CHARS)

    expect(validateArgvPrompt(atLimit)).toBe(atLimit)
  })

  // One character over is a refusal, never a truncation: a silently shortened
  // prompt would ask the model a different question than the student did.
  it('refuses a prompt one character over the ceiling', () => {
    expect(validateArgvPrompt('x'.repeat(MAX_ARGV_PROMPT_CHARS + 1))).toBeNull()
  })

  // Verified against the real binary: `agy --print ""` answers with an ERROR
  // envelope ("empty prompt") and exit 1. Spawning that is spending a process
  // to be told what the app already knows.
  it('refuses an empty prompt', () => {
    expect(validateArgvPrompt('')).toBeNull()
  })
})

describe('spawnPromptExecution — argv prompt delivery', () => {
  const QUESTION = '¿Qué dice el apunte de la clase 3?'

  /** The first spawn call, proven to have happened — the `args === undefined` guard above, reused. */
  function firstCall(spawnFn: SpawnFn): Parameters<SpawnFn> {
    const [call] = vi.mocked(spawnFn).mock.calls
    if (call === undefined) throw new Error('nothing was spawned')
    return call
  }

  it('passes the question as ONE argv element, immediately after --print', () => {
    const spawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnPromptExecution(
      ANTIGRAVITY,
      asValidated('C:\\tools\\agy.exe'),
      ATTACHMENTS_ROOT,
      asModel('gemini-3.1-pro-high'),
      spawnFn,
      asPrompt(QUESTION)
    )

    expect(spawnFn).toHaveBeenCalledWith(
      'C:\\tools\\agy.exe',
      [
        '--print',
        QUESTION,
        '--output-format',
        'json',
        '--mode',
        'plan',
        '--model',
        'gemini-3.1-pro-high',
        '--add-dir',
        ATTACHMENTS_ROOT
      ],
      expect.objectContaining({ shell: false, cwd: ATTACHMENTS_ROOT })
    )
  })

  // agy hangs on an open stdin under `--print` (known on Windows), and it has
  // no reason to read one: the whole prompt is already on argv.
  it('closes stdin for an argv provider instead of leaving it open', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnPromptExecution(
      ANTIGRAVITY,
      asValidated('C:\\tools\\agy.exe'),
      ATTACHMENTS_ROOT,
      asModel('gemini-3.1-pro-high'),
      spawnFn,
      asPrompt(QUESTION)
    )

    const [, , options] = firstCall(spawnFn)
    expect(options.stdio).toEqual(['ignore', 'pipe', 'pipe'])
  })

  // The question is arbitrary user text. On argv with `shell: false` it is one
  // opaque element and nothing parses it; the moment any shell were involved it
  // would be an injection vector. This is the test that says so.
  it.each([
    ['an ampersand', '¿Qué es A & B?'],
    ['a pipe', 'explicá a | b'],
    ['a redirect', 'compará x > y'],
    ['a double quote', 'definí "entropía"'],
    ['a percent sign', '¿qué significa %PATH%?'],
    ['a caret and a backtick', 'esto ^ y `esto`'],
    ['a newline', 'primera línea\nsegunda línea'],
    ['a flag-shaped opening', '--dangerously-skip-permissions ¿y esto?']
  ])('keeps a question containing %s inside a single argv element', (_label, hostileQuestion) => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnPromptExecution(
      ANTIGRAVITY,
      asValidated('C:\\tools\\agy.exe'),
      ATTACHMENTS_ROOT,
      asModel('gemini-3.1-pro-high'),
      spawnFn,
      asPrompt(hostileQuestion)
    )

    const [command, args, options] = firstCall(spawnFn)
    expect(command).toBe('C:\\tools\\agy.exe')
    expect(options.shell).toBe(false)
    expect(options.windowsVerbatimArguments).toBeUndefined()
    // Exactly one element IS the question, and it is the value of `--print`.
    expect(args.filter((token) => token === hostileQuestion)).toHaveLength(1)
    expect(args[args.indexOf('--print') + 1]).toBe(hostileQuestion)
  })

  // The `.cmd`/`.bat` branch builds a cmd.exe COMMAND STRING. A question is
  // untrusted text, and no quoting scheme makes user text safe inside one — so
  // this combination is refused outright rather than escaped cleverly. agy
  // ships as a real `.exe`, so nothing legitimate is lost.
  it.each([
    ['a .cmd shim', 'C:\\tools\\agy.cmd'],
    ['a .bat shim', 'C:\\tools\\agy.bat']
  ])('refuses to compose a shell command line for %s', (_label, shimPath) => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    expect(() =>
      spawnPromptExecution(
        ANTIGRAVITY,
        asValidated(shimPath),
        ATTACHMENTS_ROOT,
        asModel('gemini-3.1-pro-high'),
        spawnFn,
        asPrompt(QUESTION)
      )
    ).toThrow(/shim/i)
    expect(spawnFn).not.toHaveBeenCalled()
  })

  // A missing prompt is an app-invariant breach, not a degraded run: an argv
  // provider with no question would spawn `--print --output-format`, handing
  // the CLI a flag where its prompt should be.
  it('throws rather than spawning an argv provider with no prompt at all', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    expect(() =>
      spawnPromptExecution(
        ANTIGRAVITY,
        asValidated('C:\\tools\\agy.exe'),
        ATTACHMENTS_ROOT,
        asModel('gemini-3.1-pro-high'),
        spawnFn
      )
    ).toThrow(/prompt/i)
    expect(spawnFn).not.toHaveBeenCalled()
  })

  // The same compile-time guarantee the path and the model id carry: only what
  // the length gate returned may reach a command line.
  it('rejects a plain string prompt at the type level (see @ts-expect-error below)', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnPromptExecution(
      ANTIGRAVITY,
      asValidated('C:\\tools\\agy.exe'),
      ATTACHMENTS_ROOT,
      asModel('gemini-3.1-pro-high'),
      spawnFn,
      // @ts-expect-error — a plain `string` is not a `ValidatedArgvPrompt`; only
      // `validateArgvPrompt`'s return value may be passed here.
      'una pregunta sin validar'
    )

    expect(spawnFn).toHaveBeenCalled()
  })

  // Delivery is read off the provider's own spec, so a stdin provider handed a
  // prompt still spawns exactly the command line it always did — the question
  // stays on stdin and never appears in argv.
  it('never puts the prompt on argv for a stdin provider', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnPromptExecution(
      CLAUDE,
      asValidated('C:\\tools\\claude.exe'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn,
      asPrompt(QUESTION)
    )

    const [, args, options] = firstCall(spawnFn)
    expect(args).not.toContain(QUESTION)
    expect(options.stdio).toEqual(['pipe', 'pipe', 'pipe'])
  })
})

// The warm-session invocation (the THIRD and last sanctioned spawn). Same
// containment as the per-question one — same isolation flags, same read-only
// allowlist, same absent `--dangerously-skip-permissions` — but streaming on
// both ends so ONE process can serve many questions. What it buys, measured
// on this machine with a trivial question: ~15.5s for a fresh `-p` spawn of
// which only ~4s is inference, against ~2s per turn on a live process.
describe('spawnStreamingSession', () => {
  it('spawns a non-shim executable with the fixed streaming vector, cwd and piped stdio', () => {
    const spawnFn = vi.fn(() => ({}) as ChildProcess)
    const absPath = 'C:\tools\claude.exe'

    spawnStreamingSession(CLAUDE, asValidated(absPath), ATTACHMENTS_ROOT, asModel('claude-sonnet-5'), spawnFn)

    expect(spawnFn).toHaveBeenCalledWith(
      absPath,
      [
        '-p',
        '--safe-mode',
        '--strict-mcp-config',
        '--exclude-dynamic-system-prompt-sections',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--allowed-tools',
        'Read,Glob,Grep',
        '--model',
        'claude-sonnet-5',
        '--add-dir',
        ATTACHMENTS_ROOT
      ],
      { shell: false, cwd: ATTACHMENTS_ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
    )
  })

  it('spawns a .cmd shim through the same quoted cmd.exe vector as the other two invocations', () => {
    vi.stubEnv('ComSpec', 'C:\Windows\System32\cmd.exe')
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnStreamingSession(
      CLAUDE,
      asValidated('C:\nvm4w\nodejs\claude.cmd'),
      ATTACHMENTS_ROOT,
      asModel('claude-haiku-4-5-20251001'),
      spawnFn
    )

    const [command, args, options] = vi.mocked(spawnFn).mock.calls[0]
    if (args === undefined) throw new Error('the shim branch must pass an argv')
    expect(command).toBe('C:\Windows\System32\cmd.exe')
    expect(args[3]).toBe(
      `""C:\nvm4w\nodejs\claude.cmd" -p --safe-mode --strict-mcp-config --exclude-dynamic-system-prompt-sections --input-format stream-json --output-format stream-json --verbose --allowed-tools Read,Glob,Grep --model claude-haiku-4-5-20251001 --add-dir "${ATTACHMENTS_ROOT}""`
    )
    expect(options).toMatchObject({ shell: false, cwd: ATTACHMENTS_ROOT, windowsVerbatimArguments: true })
    vi.unstubAllEnvs()
  })

  // Print mode REJECTS `--output-format stream-json` without `--verbose`
  // ("When using --print, --output-format=stream-json requires --verbose",
  // verified against the installed CLI). Dropping it does not degrade the
  // session — it stops it from starting at all.
  it('always passes --verbose alongside the streaming output format', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnStreamingSession(
      CLAUDE,
      asValidated('C:\tools\claude.exe'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )
    spawnStreamingSession(
      CLAUDE,
      asValidated('C:\tools\claude.cmd'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )

    const [directCall, shimCall] = vi.mocked(spawnFn).mock.calls
    expect(directCall[1]).toContain('--verbose')
    expect(shimCall[1][3]).toContain('--verbose')
  })

  it('carries the same isolation flags and read-only allowlist as the per-question spawn', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    spawnStreamingSession(
      CLAUDE,
      asValidated('C:\tools\claude.exe'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )
    spawnPromptExecution(
      CLAUDE,
      asValidated('C:\tools\claude.exe'),
      ATTACHMENTS_ROOT,
      asModel('claude-sonnet-5'),
      spawnFn
    )

    const [streaming, perQuestion] = vi.mocked(spawnFn).mock.calls
    for (const flag of ['--safe-mode', '--strict-mcp-config', '--exclude-dynamic-system-prompt-sections']) {
      expect(streaming[1]).toContain(flag)
      expect(perQuestion[1]).toContain(flag)
    }
    expect(streaming[1]).toEqual(expect.arrayContaining(['--allowed-tools', 'Read,Glob,Grep']))
    expect(streaming[1].join(' ')).not.toContain('--dangerously-skip-permissions')
  })

  it.each([
    ['a relative root', 'attachments'],
    ['a root containing a quote', 'C:\att"achments'],
    ['a root containing a newline', 'C:\att\nachments']
  ])('throws on %s without spawning anything', (_label, hostileRoot) => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)

    expect(() =>
      spawnStreamingSession(
        CLAUDE,
        asValidated('C:\tools\claude.exe'),
        hostileRoot,
        asModel('claude-sonnet-5'),
        spawnFn
      )
    ).toThrow(/attachments root/i)
    expect(spawnFn).not.toHaveBeenCalled()
  })
})

// The shim branch spawns cmd.exe, so the real `claude` runs as a GRANDCHILD.
// `child.kill()` would reap cmd.exe and leave the grandchild burning tokens
// for up to the full 5-minute timeout — hence a platform-idiomatic tree kill
// (design D4), which lives here because it is itself a spawn.
describe('terminateSpawnedProcess', () => {
  function fakeChild(pid: number | undefined): { child: ChildProcess; kill: ReturnType<typeof vi.fn> } {
    const kill = vi.fn()
    return { child: { pid, kill } as unknown as ChildProcess, kill }
  }

  it('tree-kills via taskkill with a fixed numeric-pid argv on win32', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)
    const { child, kill } = fakeChild(4242)

    terminateSpawnedProcess(child, spawnFn, 'win32')

    expect(spawnFn).toHaveBeenCalledWith('taskkill', ['/pid', '4242', '/T', '/F'], { shell: false })
    expect(kill).not.toHaveBeenCalled()
  })

  it('sends SIGKILL directly on POSIX', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)
    const { child, kill } = fakeChild(4242)

    terminateSpawnedProcess(child, spawnFn, 'linux')

    expect(kill).toHaveBeenCalledWith('SIGKILL')
    expect(spawnFn).not.toHaveBeenCalled()
  })

  // A child that already exited has no pid; `taskkill /pid undefined` would
  // be a malformed vector, so fall back rather than compose garbage.
  it('falls back to kill() on win32 when the child has no pid', () => {
    const spawnFn: SpawnFn = vi.fn(() => ({}) as ChildProcess)
    const { child, kill } = fakeChild(undefined)

    terminateSpawnedProcess(child, spawnFn, 'win32')

    expect(spawnFn).not.toHaveBeenCalled()
    expect(kill).toHaveBeenCalledWith('SIGKILL')
  })
})
