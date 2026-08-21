import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { createCapabilityProbe, helpMentionsAll, requiredFlags } from './capabilityProbe'
import { PROVIDER_SPECS, type ProviderSpec } from './providerSpec'
import { CLI_PROBE_TIMEOUT_MS } from './probeLimits'
import { CLI_PROVIDERS, type CliProvider } from '../../shared/ipc/cli'
import type { ValidatedExecutablePath } from '../claude/claudeExecutableValidator'

// The probe is what turns "the documentation says this flag exists" into "the
// binary in front of me lists it". Every effect is injected — no real process,
// no real wait — exactly as in `claudeProbeService.test.ts`.

const ABS_PATH = 'C:\\tools\\fixture-cli.exe' as ValidatedExecutablePath

/**
 * An UNVERIFIED template — the whole subject of this module.
 *
 * Every provider this build ships has now been run against its real binary, so
 * `probe` short-circuits all of them and the unverified branch has no live
 * instance left. Gemini was that instance until Google deprecated the free-tier
 * Gemini CLI and it left the table. Deleting these tests along with it would
 * have thrown away the coverage of the exact path that rescues the NEXT
 * provider someone writes from documentation, so the branch keeps its subject
 * as DATA: a spec that was never run, injected in place of a real one.
 */
const UNVERIFIED_SPEC: ProviderSpec = {
  executableName: 'fixture-cli',
  overrideKey: 'fixture.executableOverride',
  connectedKey: 'fixture.connected',
  statusKey: 'fixture.lastStatus',
  label: 'Fixture CLI',
  promptDelivery: 'stdin',
  promptFlag: null,
  promptArgs: ['--output-format', 'json'],
  streamingArgs: null,
  modelFlag: '--model',
  directoryFlag: '--include-directories',
  envelope: 'claude-json',
  versionArgs: ['--version'],
  helpArgs: ['--help'],
  verified: false,
  // No tool allowlist in its vocabulary at all — the case a help page must
  // never be read as containment (see the last test in this suite).
  readOnlyTools: false
}

/**
 * The table key the fixture is injected under. Which key it is does not matter:
 * `specs` below is what `probe` reads, so this name resolves to the unverified
 * spec above and never to the real Antigravity one.
 */
const UNVERIFIED: CliProvider = 'antigravity'

const SPECS: Record<CliProvider, ProviderSpec> = { ...PROVIDER_SPECS, [UNVERIFIED]: UNVERIFIED_SPEC }

/** A help-printing double: emits `text`, then closes with `exitCode`. */
function helpPrinting(text: string, exitCode = 0, stream: 'stdout' | 'stderr' = 'stdout') {
  return vi.fn(() => {
    const emitter = new EventEmitter()
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    Object.assign(emitter, { stdout, stderr, kill: vi.fn() })

    queueMicrotask(() => {
      ;(stream === 'stdout' ? stdout : stderr).emit('data', text)
      emitter.emit('close', exitCode)
    })

    return emitter as unknown as ChildProcess
  })
}

const build = (spawn: ReturnType<typeof helpPrinting>) =>
  createCapabilityProbe({
    spawn,
    specs: SPECS,
    scheduleTimeout: () => 0 as unknown as ReturnType<typeof setTimeout>,
    clearScheduledTimeout: () => {},
    logger: { info: () => {} }
  })

/** The same probe reading the REAL table — for the providers this build ships. */
const buildReal = (spawn: ReturnType<typeof helpPrinting>) =>
  createCapabilityProbe({
    spawn,
    scheduleTimeout: () => 0 as unknown as ReturnType<typeof setTimeout>,
    clearScheduledTimeout: () => {},
    logger: { info: () => {} }
  })

/**
 * The help probe spawns the same cold binaries the version probe does, so it
 * pays the same startup cost and must budget for it identically. Measured, that
 * is not academic: `codex exec --help` came in 12ms under the 5000ms budget
 * this replaced.
 */
const buildCapturingBudget = (spawn: ReturnType<typeof helpPrinting>, capture: (ms: number) => void) =>
  createCapabilityProbe({
    spawn,
    specs: SPECS,
    scheduleTimeout: (_callback, ms) => {
      capture(ms)
      return 0 as unknown as ReturnType<typeof setTimeout>
    },
    clearScheduledTimeout: () => {},
    logger: { info: () => {} }
  })

const FIXTURE_HELP = `
  Options:
    -m, --model            The model to use
    -p, --prompt           Run in headless mode
    --output-format        Specify output format (text, json)
    --include-directories  Include additional directories
`

describe('createCapabilityProbe', () => {
  // A verified template already has the stronger guarantee — it was run
  // against a real binary. Making it depend on parsing a help page would trade
  // that down for something weaker.
  it('does not probe a provider whose template was verified at authoring time', async () => {
    const spawn = helpPrinting('irrelevant')

    const result = await build(spawn).probe('claude', ABS_PATH)

    expect(spawn).not.toHaveBeenCalled()
    expect(result).toEqual({ structuredOutput: true, warmSession: true, readOnlyTools: true })
  })

  it('confirms structured output when the binary lists every flag the template uses', async () => {
    const result = await build(helpPrinting(FIXTURE_HELP)).probe(UNVERIFIED, ABS_PATH)

    expect(result.structuredOutput).toBe(true)
  })

  // The exact failure this module was built for: a CLI's documentation
  // describes `--output-format`, and the shipped version rejects it — Gemini's
  // did (google-gemini/gemini-cli#9009). A binary that does not list it must
  // leave the provider unusable rather than spawn a command line it will refuse.
  it('reports structured output as unsupported when the documented flag is absent', async () => {
    const withoutOutputFormat = FIXTURE_HELP.replace('--output-format        Specify output format (text, json)', '')

    const result = await build(helpPrinting(withoutOutputFormat)).probe(UNVERIFIED, ABS_PATH)

    expect(result.structuredOutput).toBe(false)
  })

  // Many CLIs treat "you asked for help" as "you ran no command" and exit
  // non-zero. Gating on the exit code would call a perfectly readable help page
  // a failure.
  it('accepts a help page printed with a non-zero exit', async () => {
    const result = await build(helpPrinting(FIXTURE_HELP, 1)).probe(UNVERIFIED, ABS_PATH)

    expect(result.structuredOutput).toBe(true)
  })

  it('accepts a help page printed on stderr', async () => {
    const result = await build(helpPrinting(FIXTURE_HELP, 0, 'stderr')).probe(UNVERIFIED, ABS_PATH)

    expect(result.structuredOutput).toBe(true)
  })

  it('schedules the shared CLI probe budget when no timeout is injected', async () => {
    let scheduledMs: number | undefined
    await buildCapturingBudget(helpPrinting(FIXTURE_HELP), (ms) => {
      scheduledMs = ms
    }).probe(UNVERIFIED, ABS_PATH)

    expect(scheduledMs).toBe(CLI_PROBE_TIMEOUT_MS)
  })

  it('reports nothing supported when the binary prints no help at all', async () => {
    const result = await build(helpPrinting('')).probe(UNVERIFIED, ABS_PATH)

    expect(result).toEqual({ structuredOutput: false, warmSession: false, readOnlyTools: false })
  })

  it('reports nothing supported when the spawn itself fails', async () => {
    const spawn = vi.fn(() => {
      throw new Error('EACCES')
    })

    const result = await createCapabilityProbe({
      spawn,
      specs: SPECS,
      scheduleTimeout: () => 0 as unknown as ReturnType<typeof setTimeout>,
      clearScheduledTimeout: () => {},
      logger: { info: () => {} }
    }).probe(UNVERIFIED, ABS_PATH)

    expect(result.structuredOutput).toBe(false)
  })

  // A probe cannot invent an argv flag that does not exist. A provider with no
  // tool allowlist in its vocabulary must not have a help page mentioning every
  // flag it DOES have read as containment it cannot offer.
  it('never upgrades a provider that has no read-only allowlist in its vocabulary', async () => {
    const result = await build(helpPrinting(FIXTURE_HELP)).probe(UNVERIFIED, ABS_PATH)

    expect(result.readOnlyTools).toBe(false)
  })

  // A one-shot CLI has no duplex stdin to keep alive, and no help text can
  // change that.
  it('never grants a warm session to a provider with no streaming template', async () => {
    const result = await build(helpPrinting(FIXTURE_HELP)).probe(UNVERIFIED, ABS_PATH)

    expect(result.warmSession).toBe(false)
  })

  // Every provider this build offers was run against its real binary — Claude,
  // Antigravity (agy.exe 1.1.15) and Codex alike — so none of them may be
  // downgraded to depending on a help page.
  it.each(CLI_PROVIDERS)('short-circuits %s, whose template was verified', async (provider) => {
    const spawn = helpPrinting('irrelevant')

    const result = await buildReal(spawn).probe(provider, ABS_PATH)

    expect(spawn).not.toHaveBeenCalled()
    expect(result.structuredOutput).toBe(true)
  })

  // The help page a subcommand-based template must be read from — asserted on
  // the spec itself, since the probe no longer spawns for this provider.
  it('points a subcommand-based template at its own help page', () => {
    expect(PROVIDER_SPECS.codex.helpArgs).toEqual(['exec', '--help'])
  })
})

describe('requiredFlags', () => {
  // Subcommands and stdin markers are not flags, and demanding a help page
  // mention `exec` or `-` would fail every real CLI.
  it('takes only the long-form flags out of a template', () => {
    expect(requiredFlags(PROVIDER_SPECS.codex.promptArgs)).toEqual([
      '--json',
      '--sandbox',
      '--skip-git-repo-check',
      '--ephemeral',
      '--ignore-user-config'
    ])
  })
})

describe('helpMentionsAll', () => {
  it('is satisfied when every flag appears', () => {
    expect(helpMentionsAll('--json and --sandbox', ['--json', '--sandbox'])).toBe(true)
  })

  // A prefix match would let `--output` satisfy a requirement for
  // `--output-format`, which is precisely the flag whose absence this whole
  // module exists to detect.
  it('does not let a shorter flag satisfy a longer one', () => {
    expect(helpMentionsAll('--output <file>', ['--output-format'])).toBe(false)
  })

  it('still matches a flag followed by punctuation or end of line', () => {
    expect(helpMentionsAll('--output-format=json', ['--output-format'])).toBe(true)
    expect(helpMentionsAll('--json', ['--json'])).toBe(true)
  })
})
