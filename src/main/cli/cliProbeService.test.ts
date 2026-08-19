import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { createCliProbeService, type AppSettingsPort } from './cliProbeService'
import type { CapabilityProbe, ProbedCapabilities } from './capabilityProbe'
import { PROVIDER_SPECS } from './providerSpec'
import type { ValidatedExecutablePath } from '../claude/claudeExecutableValidator'

// Threat matrix (spec "Three-State Status Classification", "Hard Timeout",
// "Probe Audit Log"; threat-matrix "Subprocess integration"), carried over from
// the single-provider probe this generalizes and extended with the two things
// that are new: it runs once PER PROVIDER, and a connected provider also gets
// its capabilities observed and cached.
//
// Every dependency is injected — no test here spawns a real process or waits
// on a real timer.

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn()
}

const asChildProcess = (child: FakeChildProcess): ChildProcess => child as unknown as ChildProcess
const asValidated = (candidatePath: string): ValidatedExecutablePath => candidatePath as ValidatedExecutablePath

const fakeSettings = (values: Record<string, string> = {}): AppSettingsPort => ({
  get: vi.fn((key: string) => values[key] ?? null)
})

const ALL_SUPPORTED: ProbedCapabilities = { structuredOutput: true, warmSession: true, readOnlyTools: true }
const NONE_SUPPORTED: ProbedCapabilities = { structuredOutput: false, warmSession: false, readOnlyTools: false }

const fakeCapabilityProbe = (result: ProbedCapabilities = ALL_SUPPORTED): CapabilityProbe => ({
  probe: vi.fn(async () => result)
})

/**
 * `probe()` awaits the injected `resolve`/`validate` promises before it
 * attaches listeners to the spawned child — a macrotask flush (unlike a bare
 * microtask await) guarantees every one of those pending ticks has settled, so
 * it is safe to emit on the fake child afterward.
 */
const flushAsync = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

function build(overrides: Partial<Parameters<typeof createCliProbeService>[0]> = {}, child = new FakeChildProcess()) {
  const logs: string[] = []
  const service = createCliProbeService({
    settings: fakeSettings(),
    resolve: vi.fn(async () => 'C:\\tools\\cli.cmd'),
    validate: vi.fn(async (candidatePath: string) => asValidated(candidatePath)),
    spawn: vi.fn(() => asChildProcess(child)),
    capabilityProbe: fakeCapabilityProbe(),
    logger: {
      info: (message: string) => {
        logs.push(message)
      }
    },
    ...overrides
  })
  return { service, child, logs }
}

describe('createCliProbeService — three-state classification', () => {
  it('resolves to connected when the process exits 0 with a parseable version', async () => {
    const { service, child } = build()

    const promise = service.probe('claude')
    await flushAsync()
    child.stdout.emit('data', '2.1.220 (Claude Code)\n')
    child.emit('close', 0)

    expect(await promise).toEqual({
      provider: 'claude',
      status: 'connected',
      version: '2.1.220',
      resolvedPath: 'C:\\tools\\cli.cmd',
      source: 'auto',
      overridePath: null,
      detail: null,
      capabilities: ALL_SUPPORTED
    })
  })

  it('resolves to not-found when no candidate resolves and never validates or spawns', async () => {
    const validate = vi.fn()
    const spawn = vi.fn()
    const { service } = build({ resolve: vi.fn(async () => null), validate, spawn })

    const status = await service.probe('codex')

    expect(status.status).toBe('not-found')
    expect(status.provider).toBe('codex')
    expect(validate).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  // A path that validated but vanished before spawn is honestly not-found, not
  // unusable — the same race honesty the single-provider probe applied.
  it('resolves to not-found when spawn fails with ENOENT', async () => {
    const { service, child } = build()

    const promise = service.probe('claude')
    await flushAsync()
    child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))

    expect((await promise).status).toBe('not-found')
  })

  it('resolves to unusable with the exit code when the process exits non-zero', async () => {
    const { service, child } = build()

    const promise = service.probe('claude')
    await flushAsync()
    child.emit('close', 9)
    const status = await promise

    expect(status.status).toBe('unusable')
    expect(status.detail).toContain('9')
  })

  it('resolves to unusable when the process exits 0 but prints no parseable version', async () => {
    const { service, child } = build()

    const promise = service.probe('claude')
    await flushAsync()
    child.stdout.emit('data', 'command not recognized\n')
    child.emit('close', 0)
    const status = await promise

    expect(status.status).toBe('unusable')
    expect(status.detail).toBe('command not recognized')
  })

  it('kills the process and resolves to unusable when the hard timeout elapses', async () => {
    const child = new FakeChildProcess()
    let fire: (() => void) | undefined
    const { service } = build(
      {
        timeoutMs: 5000,
        scheduleTimeout: (callback) => {
          fire = callback
          return 0 as never
        },
        clearScheduledTimeout: () => {}
      },
      child
    )

    const promise = service.probe('claude')
    await flushAsync()
    fire?.()
    const status = await promise

    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(status.status).toBe('unusable')
    expect(status.detail).toContain('5000')
  })

  // Validation gates the SPAWN, not the save: a saved-but-broken override is
  // reported honestly and never rewritten.
  it('reports a saved override that fails pre-spawn validation as unusable, without spawning', async () => {
    const spawn = vi.fn()
    const { service } = build({
      settings: fakeSettings({ [PROVIDER_SPECS.codex.overrideKey]: 'not-absolute' }),
      validate: vi.fn(async () => null),
      spawn
    })

    const status = await service.probe('codex')

    expect(status.status).toBe('unusable')
    expect(status.source).toBe('override')
    expect(status.overridePath).toBe('not-absolute')
    expect(spawn).not.toHaveBeenCalled()
  })
})

describe('createCliProbeService — per-provider resolution', () => {
  it('looks each provider up by its own executable name and override key', async () => {
    // The parameter is typed on purpose: this assertion reads the executable
    // name each call was made with, and a zero-arg mock exposes no such tuple.
    const resolve = vi.fn(async (_executableName: string): Promise<string | null> => null)
    const settings = fakeSettings()
    const { service } = build({ resolve, settings })

    await service.probeAll()

    // Gemini is disabled, so it is never looked up at all — no PATH walk, no
    // settings read, no process.
    expect(resolve.mock.calls.map(([name]) => name)).toEqual(['claude', 'codex'])
    expect(vi.mocked(settings.get).mock.calls.map(([key]) => key)).toEqual([
      'claude.executableOverride',
      'codex.executableOverride'
    ])
  })

  it('probes every supported provider, in menu order', async () => {
    const { service } = build({ resolve: vi.fn(async () => null) })

    expect((await service.probeAll()).map((entry) => entry.provider)).toEqual(['claude', 'codex'])
  })
})

describe('createCliProbeService — capability caching', () => {
  it('reports nothing observed before any probe has run', () => {
    const { service } = build()

    expect(service.capabilities('codex')).toBeNull()
  })

  it('caches what the capability probe observed for a connected provider', async () => {
    const { service, child } = build({ capabilityProbe: fakeCapabilityProbe(NONE_SUPPORTED) })

    const promise = service.probe('codex')
    await flushAsync()
    child.stdout.emit('data', '0.4.1\n')
    child.emit('close', 0)
    await promise

    expect(service.capabilities('codex')).toEqual(NONE_SUPPORTED)
  })

  // THIS is the one askService reads to decide whether an unverified provider
  // may be spawned at all. A stale clearance surviving an uninstall would let
  // a question spawn against a binary that is no longer there.
  it('clears a previous observation when the provider stops resolving', async () => {
    const child = new FakeChildProcess()
    let resolved: string | null = 'C:\\tools\\codex.cmd'
    const { service } = build({ resolve: vi.fn(async () => resolved) }, child)

    const promise = service.probe('codex')
    await flushAsync()
    child.stdout.emit('data', '0.4.1\n')
    child.emit('close', 0)
    await promise
    expect(service.capabilities('codex')).not.toBeNull()

    resolved = null
    await service.probe('codex')

    expect(service.capabilities('codex')).toBeNull()
  })

  it('does not ask for capabilities when the CLI never reached a usable state', async () => {
    const capabilityProbe = fakeCapabilityProbe()
    const { service } = build({ resolve: vi.fn(async () => null), capabilityProbe })

    await service.probe('codex')

    expect(capabilityProbe.probe).not.toHaveBeenCalled()
  })
})

describe('createCliProbeService — audit log', () => {
  it('names the provider on a completed probe, with its path, source, exit code and duration', async () => {
    let clock = 0
    const { service, child, logs } = build({ now: () => (clock += 40) })

    const promise = service.probe('claude')
    await flushAsync()
    child.stdout.emit('data', '2.1.220\n')
    child.emit('close', 0)
    await promise

    expect(logs.join('\n')).toContain('provider=claude')
    expect(logs.join('\n')).toContain('exitCode=0')
    expect(logs.join('\n')).toContain('durationMs=40')
  })

  // No exitCode/durationMs fields here: there was no process, and placeholder
  // values for them would misread as a real spawn result.
  it('records that no candidate resolved without inventing process fields', async () => {
    const { service, logs } = build({ resolve: vi.fn(async () => null) })

    await service.probe('codex')

    expect(logs[0]).toContain('provider=codex')
    expect(logs[0]).toContain('no executable resolved')
    expect(logs[0]).not.toContain('exitCode')
    expect(logs[0]).not.toContain('durationMs')
  })
})
