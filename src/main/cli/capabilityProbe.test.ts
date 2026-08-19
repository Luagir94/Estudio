import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { createCapabilityProbe, helpMentionsAll, requiredFlags } from './capabilityProbe'
import { PROVIDER_SPECS } from './providerSpec'
import type { ValidatedExecutablePath } from '../claude/claudeExecutableValidator'

// The probe is what turns "the documentation says this flag exists" into "the
// binary in front of me lists it". Every effect is injected — no real process,
// no real wait — exactly as in `claudeProbeService.test.ts`.

const ABS_PATH = 'C:\\tools\\gemini.exe' as ValidatedExecutablePath

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
    scheduleTimeout: () => 0 as unknown as ReturnType<typeof setTimeout>,
    clearScheduledTimeout: () => {},
    logger: { info: () => {} }
  })

const GEMINI_HELP = `
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
    const result = await build(helpPrinting(GEMINI_HELP)).probe('gemini', ABS_PATH)

    expect(result.structuredOutput).toBe(true)
  })

  // The exact failure this module was built for: Gemini's documentation
  // describes `--output-format`, and shipped versions have rejected it
  // (google-gemini/gemini-cli#9009). A binary that does not list it must leave
  // the provider unusable rather than spawn a command line it will refuse.
  it('reports structured output as unsupported when the documented flag is absent', async () => {
    const withoutOutputFormat = GEMINI_HELP.replace('--output-format        Specify output format (text, json)', '')

    const result = await build(helpPrinting(withoutOutputFormat)).probe('gemini', ABS_PATH)

    expect(result.structuredOutput).toBe(false)
  })

  // Many CLIs treat "you asked for help" as "you ran no command" and exit
  // non-zero. Gating on the exit code would call a perfectly readable help page
  // a failure.
  it('accepts a help page printed with a non-zero exit', async () => {
    const result = await build(helpPrinting(GEMINI_HELP, 1)).probe('gemini', ABS_PATH)

    expect(result.structuredOutput).toBe(true)
  })

  it('accepts a help page printed on stderr', async () => {
    const result = await build(helpPrinting(GEMINI_HELP, 0, 'stderr')).probe('gemini', ABS_PATH)

    expect(result.structuredOutput).toBe(true)
  })

  it('reports nothing supported when the binary prints no help at all', async () => {
    const result = await build(helpPrinting('')).probe('gemini', ABS_PATH)

    expect(result).toEqual({ structuredOutput: false, warmSession: false, readOnlyTools: false })
  })

  it('reports nothing supported when the spawn itself fails', async () => {
    const spawn = vi.fn(() => {
      throw new Error('EACCES')
    })

    const result = await createCapabilityProbe({
      spawn,
      scheduleTimeout: () => 0 as unknown as ReturnType<typeof setTimeout>,
      clearScheduledTimeout: () => {},
      logger: { info: () => {} }
    }).probe('gemini', ABS_PATH)

    expect(result.structuredOutput).toBe(false)
  })

  // A probe cannot invent an argv flag that does not exist. Gemini has no tool
  // allowlist, and a help page mentioning every flag it DOES have must not be
  // read as containment it cannot offer.
  it('never upgrades a provider that has no read-only allowlist in its vocabulary', async () => {
    const result = await build(helpPrinting(GEMINI_HELP)).probe('gemini', ABS_PATH)

    expect(result.readOnlyTools).toBe(false)
  })

  // A one-shot CLI has no duplex stdin to keep alive, and no help text can
  // change that.
  it('never grants a warm session to a provider with no streaming template', async () => {
    const result = await build(helpPrinting(GEMINI_HELP)).probe('gemini', ABS_PATH)

    expect(result.warmSession).toBe(false)
  })

  // Codex joined Claude as verified once its template was run against
  // codex-cli 0.148.0-alpha.15, so it short-circuits the same way.
  it('short-circuits every provider whose template was verified', async () => {
    const spawn = helpPrinting('irrelevant')

    const result = await build(spawn).probe('codex', ABS_PATH)

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
