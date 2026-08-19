import * as nodeFs from 'node:fs/promises'
import type { ChildProcess } from 'node:child_process'
import log from 'electron-log'
import { resolveExecutable } from '../claude/domain/executableResolver'
import {
  spawnVersionProbe,
  validateExecutableCandidate,
  type ValidatedExecutablePath
} from '../claude/claudeExecutableValidator'
import { createCapabilityProbe, type CapabilityProbe, type ProbedCapabilities } from './capabilityProbe'
import { PROVIDER_SPECS } from './providerSpec'
import { CLI_PROVIDERS, type CliProvider, type CliProviderStatus } from '../../shared/ipc/cli'

// Orchestrates the three-state probe (spec "Three-State Status
// Classification", "Hard Timeout", "Probe Audit Log") for EVERY supported CLI
// rather than only for Claude. It is the generalization of the single-provider
// probe this replaced: same chain, same three states, same hard timeout, same
// honesty about a saved-but-broken override — now once per provider.
//
// Two things are new, and both exist because the app no longer trusts its own
// argv templates equally:
//
//  1. A `connected` provider also gets a CAPABILITY probe, so the settings
//     screen can say what the installed binary actually supports rather than
//     what its documentation claims.
//  2. Those observations are CACHED here, because `askService` needs them to
//     decide whether an unverified provider may be spawned at all. Without a
//     cache, every question would pay a help-page spawn to answer a question
//     the settings screen already answered.
//
// Every external effect is injected, so every branch is provable without a
// real filesystem, a real process, or a real wait. Nothing here imports
// `child_process` — only the validator may.

const DEFAULT_TIMEOUT_MS = 5000
const VERSION_PATTERN = /\d+\.\d+\.\d+/

/**
 * The subset of the sqlite-backed settings store this service needs. Defined
 * HERE (the convention the single-provider probe established) so this file
 * stays dead-code-safe on its own.
 */
export interface AppSettingsPort {
  get(key: string): string | null
}

export type TimeoutHandle = ReturnType<typeof setTimeout>

export interface CliProbeServiceDeps {
  settings: AppSettingsPort
  /** Resolves a provider's executable name on PATH/PATHEXT. Defaults to the real resolver. */
  resolve?: (executableName: string) => Promise<string | null>
  /** Pre-spawn trust-boundary check. Defaults to the validator's real export. */
  validate?: (candidatePath: string) => Promise<ValidatedExecutablePath | null>
  /** Starts the version probe. Defaults to the validator's real export. */
  spawn?: (absPath: ValidatedExecutablePath) => ChildProcess
  /** Observes what the installed binary supports. Defaults to the real capability probe. */
  capabilityProbe?: CapabilityProbe
  timeoutMs?: number
  now?: () => number
  scheduleTimeout?: (callback: () => void, ms: number) => TimeoutHandle
  clearScheduledTimeout?: (handle: TimeoutHandle) => void
  logger?: Pick<typeof log, 'info'>
}

export interface CliProbeService {
  /** Probes every supported provider, in menu order. */
  probeAll(): Promise<CliProviderStatus[]>
  probe(provider: CliProvider): Promise<CliProviderStatus>
  /**
   * The most recent capability observation for `provider`, or `null` when it
   * has never probed successfully. THIS is what `askService` reads to decide
   * whether an unverified provider may be cleared for a spawn.
   */
  capabilities(provider: CliProvider): ProbedCapabilities | null
}

interface ProbeOutcome {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  spawnErrorCode?: string
}

const defaultResolve = (executableName: string): Promise<string | null> =>
  resolveExecutable(executableName, { env: process.env, fs: nodeFs })

const defaultValidate = (candidatePath: string): Promise<ValidatedExecutablePath | null> =>
  validateExecutableCandidate(candidatePath, { fs: nodeFs })

export function createCliProbeService({
  settings,
  resolve = defaultResolve,
  validate = defaultValidate,
  spawn = (absPath) => spawnVersionProbe(absPath),
  capabilityProbe = createCapabilityProbe(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now,
  scheduleTimeout = (callback, ms) => setTimeout(callback, ms),
  clearScheduledTimeout = (handle) => clearTimeout(handle),
  logger = log
}: CliProbeServiceDeps): CliProbeService {
  const observed = new Map<CliProvider, ProbedCapabilities>()

  async function probe(provider: CliProvider): Promise<CliProviderStatus> {
    const spec = PROVIDER_SPECS[provider]
    const overridePath = settings.get(spec.overrideKey)
    const source: CliProviderStatus['source'] = overridePath ? 'override' : 'auto'
    const candidatePath = overridePath ?? (await resolve(spec.executableName))

    if (!candidatePath) {
      // Every probe is audited, including one that never reaches a spawn
      // attempt — this is exactly the case someone would check the log to
      // investigate. No `exitCode`/`durationMs` here: there was no process,
      // and placeholder values would misread as a real spawn result.
      logger.info(`cli probe: provider=${provider} source=${source} no executable resolved — no process started`)
      // A provider that is not installed keeps whatever it last observed
      // CLEARED, so an uninstall cannot leave a stale clearance behind.
      observed.delete(provider)
      return buildStatus({ provider, status: 'not-found', source, overridePath })
    }

    // Validation gates the SPAWN, not the save. An invalid saved override is
    // never rewritten or deleted here — it is reported honestly. This outcome
    // is `unusable` rather than `not-found`: the app found exactly what it was
    // told to use and that thing does not work.
    const validated = await validate(candidatePath)
    if (!validated) {
      const who = source === 'override' ? 'Configured override' : 'Resolved path'
      logger.info(
        `cli probe: provider=${provider} path=${candidatePath} source=${source} rejected by pre-spawn validation — no process started`
      )
      observed.delete(provider)
      return buildStatus({
        provider,
        status: 'unusable',
        source,
        overridePath,
        detail: `${who} is not a valid executable: ${candidatePath}`
      })
    }

    const startedAt = now()
    const outcome = await runProbe(validated, spawn, timeoutMs, scheduleTimeout, clearScheduledTimeout)
    const durationMs = now() - startedAt

    logger.info(
      `cli probe: provider=${provider} path=${validated} source=${source} exitCode=${outcome.exitCode ?? 'null'} durationMs=${durationMs}`
    )

    // A path that validated but vanished before spawn (race) is honestly
    // `not-found`, not `unusable`.
    if (outcome.spawnErrorCode === 'ENOENT') {
      observed.delete(provider)
      return buildStatus({ provider, status: 'not-found', source, overridePath })
    }
    if (outcome.timedOut) {
      observed.delete(provider)
      return buildStatus({
        provider,
        status: 'unusable',
        source,
        overridePath,
        resolvedPath: validated,
        detail: `Probe timed out after ${timeoutMs}ms`
      })
    }
    if (outcome.exitCode !== 0) {
      observed.delete(provider)
      return buildStatus({
        provider,
        status: 'unusable',
        source,
        overridePath,
        resolvedPath: validated,
        detail: `Exited with code ${outcome.exitCode ?? 'unknown'}`
      })
    }

    const version = parseVersion(outcome.stdout)
    if (!version) {
      observed.delete(provider)
      return buildStatus({
        provider,
        status: 'unusable',
        source,
        overridePath,
        resolvedPath: validated,
        detail: firstLine(outcome.stderr) ?? firstLine(outcome.stdout) ?? 'Unrecognized output'
      })
    }

    // Only a reachable, runnable binary is worth asking about capabilities —
    // and only here is there a validated path to ask with.
    const capabilities = await capabilityProbe.probe(provider, validated)
    observed.set(provider, capabilities)

    return buildStatus({
      provider,
      status: 'connected',
      source,
      overridePath,
      resolvedPath: validated,
      version,
      capabilities
    })
  }

  return {
    probe,
    // Sequential rather than parallel on purpose: each provider spawns up to
    // two short-lived processes, and three CLIs booting at once on a student's
    // laptop is a worse first impression than a settings screen that fills in
    // over a second.
    probeAll: async () => {
      const statuses: CliProviderStatus[] = []
      for (const provider of CLI_PROVIDERS) {
        statuses.push(await probe(provider))
      }
      return statuses
    },
    capabilities: (provider) => observed.get(provider) ?? null
  }
}

/** Runs one spawned probe to completion — exit, spawn error, or the hard timeout, whichever comes first. */
function runProbe(
  validated: ValidatedExecutablePath,
  spawn: (absPath: ValidatedExecutablePath) => ChildProcess,
  timeoutMs: number,
  scheduleTimeout: (callback: () => void, ms: number) => TimeoutHandle,
  clearScheduledTimeout: (handle: TimeoutHandle) => void
): Promise<ProbeOutcome> {
  return new Promise((resolveOutcome) => {
    const child = spawn(validated)
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (outcome: ProbeOutcome): void => {
      if (settled) return
      settled = true
      resolveOutcome(outcome)
    }

    const timer = scheduleTimeout(() => {
      if (settled) return
      child.kill('SIGKILL')
      finish({ exitCode: null, stdout, stderr, timedOut: true })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk)
    })

    child.once('error', (error: NodeJS.ErrnoException) => {
      clearScheduledTimeout(timer)
      finish({ exitCode: null, stdout, stderr, timedOut: false, spawnErrorCode: error.code })
    })

    child.once('close', (code: number | null) => {
      clearScheduledTimeout(timer)
      finish({ exitCode: code, stdout, stderr, timedOut: false })
    })
  })
}

function buildStatus(params: {
  provider: CliProvider
  status: CliProviderStatus['status']
  source: CliProviderStatus['source']
  overridePath: string | null
  resolvedPath?: string | null
  version?: string | null
  detail?: string | null
  capabilities?: ProbedCapabilities | null
}): CliProviderStatus {
  return {
    provider: params.provider,
    status: params.status,
    version: params.version ?? null,
    resolvedPath: params.resolvedPath ?? null,
    source: params.source,
    overridePath: params.overridePath,
    detail: params.detail ?? null,
    capabilities: params.capabilities ?? null
  }
}

function parseVersion(stdout: string): string | null {
  return VERSION_PATTERN.exec(stdout)?.[0] ?? null
}

function firstLine(text: string): string | null {
  return (
    text
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0) ?? null
  )
}
