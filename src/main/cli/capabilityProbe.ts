import type { ChildProcess } from 'node:child_process'
import log from 'electron-log'
import { spawnHelpProbe, type ValidatedExecutablePath } from '../claude/claudeExecutableValidator'
import { declaredCapabilities, PROVIDER_SPECS, type ProviderSpec } from './providerSpec'
import { CLI_PROBE_TIMEOUT_MS } from './probeLimits'
import type { CliProvider } from '../../shared/ipc/cli'

// Asks an INSTALLED binary which flags it actually accepts, instead of
// trusting what its documentation says.
//
// This module exists because of a specific, verified failure mode. Every
// template the app ships today was checked against its real binary, but that is
// a fact about today's table: the Gemini template that used to sit beside them
// was written from a published reference and never run, and Gemini's own
// documentation described an `--output-format` flag that shipped versions
// rejected (google-gemini/gemini-cli#9009). A template built on a document is a
// hypothesis, and spawning a hypothesis at this boundary means aiming a
// malformed command line at the student's own account.
//
// The probe reads a help page. That is deliberately the cheapest possible
// observation: no tokens, no account, no network, no model. It cannot prove
// the flags BEHAVE correctly — only a real question can do that — but it does
// prove the binary knows them, which is exactly the failure that issue
// describes and exactly what separates "unverified" from "confirmed".
//
// That ceiling is not theoretical. The codex template shipped without
// `--skip-git-repo-check`, and this probe would have cleared it happily: every
// flag it did name was listed in the help page. Every run would still have
// died before reaching the model, because the app's cwd is not a git
// repository and codex refuses that by default. A missing flag is invisible to
// a probe that can only check the flags it was told about.
//
// So this is a FLOOR, not a proof. `verified: true` on a spec still means a
// human ran the real binary; the probe only rescues the providers where nobody
// has.
//
// Nothing here imports `child_process`: the spawn comes from the validator,
// the sole spawn site, as `cliProbeService` already does.

const DEFAULT_TIMEOUT_MS = CLI_PROBE_TIMEOUT_MS

export interface ProbedCapabilities {
  /** The provider's structured-output flags are all listed by the binary. */
  structuredOutput: boolean
  /** A duplex streaming session exists AND its flags are all listed. */
  warmSession: boolean
  /** Tool access can be restricted to a read-only set at the spawn boundary. */
  readOnlyTools: boolean
}

export type TimeoutHandle = ReturnType<typeof setTimeout>

export interface CapabilityProbeDeps {
  /** Starts the help probe. Defaults to the validator's real export. */
  spawn?: (provider: CliProvider, absPath: ValidatedExecutablePath) => ChildProcess
  /**
   * The table the templates are read from. Injected for the same reason every
   * other effect here is: the branch this module exists for only runs for an
   * UNVERIFIED spec, and every spec the app ships is verified — so its only
   * remaining subject is a spec supplied as data.
   */
  specs?: Record<CliProvider, ProviderSpec>
  timeoutMs?: number
  scheduleTimeout?: (callback: () => void, ms: number) => TimeoutHandle
  clearScheduledTimeout?: (handle: TimeoutHandle) => void
  logger?: Pick<typeof log, 'info'>
}

export interface CapabilityProbe {
  probe(provider: CliProvider, absPath: ValidatedExecutablePath): Promise<ProbedCapabilities>
}

/** Every long-form flag a template depends on — the tokens the help page must mention. */
export function requiredFlags(template: readonly string[]): string[] {
  return template.filter((token) => token.startsWith('--'))
}

/**
 * `true` only when the help text mentions EVERY flag the template uses.
 *
 * Matched with a word boundary rather than a bare `includes`, so `--output`
 * does not satisfy a requirement for `--output-format`, and a flag named in
 * prose still counts — help pages list aliases and wrap lines in ways that a
 * stricter parse would trip over, and a false "missing" here would strand a
 * working CLI as unusable.
 */
export function helpMentionsAll(helpText: string, flags: readonly string[]): boolean {
  return flags.every((flag) => new RegExp(`${escapeForRegExp(flag)}(?![\\w-])`).test(helpText))
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const defaultSpawn = (provider: CliProvider, absPath: ValidatedExecutablePath): ChildProcess =>
  spawnHelpProbe(provider, absPath)

export function createCapabilityProbe({
  spawn = defaultSpawn,
  specs = PROVIDER_SPECS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  scheduleTimeout = (callback, ms) => setTimeout(callback, ms),
  clearScheduledTimeout = (handle) => clearTimeout(handle),
  logger = log
}: CapabilityProbeDeps = {}): CapabilityProbe {
  async function probe(provider: CliProvider, absPath: ValidatedExecutablePath): Promise<ProbedCapabilities> {
    const spec = specs[provider]
    const declared = declaredCapabilities(spec)

    // A verified template needs no confirmation: it was run against a real
    // binary when it was written. Probing it anyway would make the app's own
    // known-good path depend on parsing a help page, which is a worse
    // guarantee than the one it already has.
    if (spec.verified) {
      return declared
    }

    const help = await readHelp(provider, absPath, spawn, timeoutMs, scheduleTimeout, clearScheduledTimeout)
    if (help === null) {
      logger.info(`capability probe: provider=${provider} help unreadable — reporting nothing supported`)
      return { structuredOutput: false, warmSession: false, readOnlyTools: false }
    }

    const structuredOutput = helpMentionsAll(help, requiredFlags(spec.promptArgs))
    const warmSession = spec.streamingArgs !== null && helpMentionsAll(help, requiredFlags(spec.streamingArgs))

    logger.info(
      `capability probe: provider=${provider} structuredOutput=${structuredOutput} warmSession=${warmSession}`
    )

    return {
      structuredOutput,
      warmSession,
      // Never upgraded by a probe: whether a provider can be confined to a
      // read-only tool set is a property of its ARGV VOCABULARY, declared on
      // its spec, not of what its help page happens to print. A CLI with no
      // such flag has none, and no amount of probing invents one.
      readOnlyTools: declared.readOnlyTools && structuredOutput
    }
  }

  return { probe }
}

/** Runs one help probe to completion — exit, spawn error, or the hard timeout. */
function readHelp(
  provider: CliProvider,
  absPath: ValidatedExecutablePath,
  spawn: (provider: CliProvider, absPath: ValidatedExecutablePath) => ChildProcess,
  timeoutMs: number,
  scheduleTimeout: (callback: () => void, ms: number) => TimeoutHandle,
  clearScheduledTimeout: (handle: TimeoutHandle) => void
): Promise<string | null> {
  return new Promise((resolveOutcome) => {
    let child: ChildProcess
    try {
      child = spawn(provider, absPath)
    } catch {
      resolveOutcome(null)
      return
    }

    // Help pages land on stdout for some CLIs and stderr for others, and which
    // one is not worth depending on — both are read and concatenated.
    let output = ''
    let settled = false

    const finish = (value: string | null): void => {
      if (settled) return
      settled = true
      clearScheduledTimeout(timer)
      resolveOutcome(value)
    }

    const timer = scheduleTimeout(() => {
      if (settled) return
      child.kill('SIGKILL')
      finish(null)
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer | string) => {
      output += String(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      output += String(chunk)
    })

    child.once('error', () => finish(null))
    // A help page is commonly printed with a NON-ZERO exit (many CLIs treat
    // "you asked for help" as "you did not run a command"), so the exit code is
    // deliberately not a gate — only whether anything was printed at all.
    child.once('close', () => finish(output.length > 0 ? output : null))
  })
}
