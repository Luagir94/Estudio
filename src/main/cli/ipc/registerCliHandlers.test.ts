import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CliProviderStatus } from '../../../shared/ipc/cli'
import type { CliProbeService } from '../cliProbeService'
import type { ModelCatalog } from '../modelCatalog'

const { ipcMainMock } = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
  return {
    ipcMainMock: {
      handlers,
      handle: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener)
      })
    }
  }
})

const logErrorMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ ipcMain: ipcMainMock }))
vi.mock('electron-log', () => ({ default: { error: logErrorMock } }))

import { registerCliHandlers } from './registerCliHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const statusFor = (provider: CliProviderStatus['provider']): CliProviderStatus => ({
  provider,
  status: 'connected',
  version: '1.2.3',
  resolvedPath: 'C:\\tools\\cli.cmd',
  source: 'auto',
  overridePath: null,
  detail: null,
  failureReason: null,
  capabilities: { structuredOutput: true, warmSession: true, readOnlyTools: true }
})

/**
 * Handler-only tests (spec "IPC Contract" — every channel returns `IpcResult`,
 * zod parses BOTH sides, nothing ever throws across the bridge). The
 * status-mapping logic itself belongs to `cliProbeService` and is exhaustively
 * tested there; this file only proves the handlers compose it correctly, never
 * leak a raw throw, and resolve settings keys from the app's own table rather
 * than from the wire.
 */
describe('registerCliHandlers', () => {
  let probeService: CliProbeService
  let settingsRepository: { set: (key: string, value: string | null) => void }
  let settings: { get: (key: string) => string | null }
  let modelCatalog: ModelCatalog

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    vi.clearAllMocks()
    probeService = {
      probe: vi.fn(async (provider) => statusFor(provider)),
      capabilities: vi.fn(() => null),
      forget: vi.fn()
    }
    settingsRepository = { set: vi.fn() }
    settings = { get: vi.fn(() => null) }
    modelCatalog = {
      discover: vi.fn(async () => [
        { provider: 'claude' as const, modelId: 'claude-fable-5[1m]', origin: 'catalog' as const, rank: null }
      ])
    }
    registerCliHandlers({ probeService, settings, settingsRepository, modelCatalog })
  })

  describe('cli:probe', () => {
    it('probes the named provider and returns its status in the ok envelope', async () => {
      const result = await invoke('cli:probe', { provider: 'codex' })

      expect(result).toEqual({ ok: true, data: statusFor('codex') })
      expect(probeService.probe).toHaveBeenCalledTimes(1)
      expect(probeService.probe).toHaveBeenCalledWith('codex')
    })

    it.each([
      ['an empty payload', {}],
      ['no payload at all', undefined],
      ['a provider this app has never heard of', { provider: 'ollama' }],
      // Same standing-in fixture id `cli:setOverride` uses: the write-side gate
      // is what keeps an unenabled provider from reaching a spawn, and every
      // provider the contract admits today happens to be enabled.
      ['a provider the enabled gate refuses', { provider: 'fixture-cli' }]
    ])('rejects %s without starting a process', async (_label, payload) => {
      const result = (await invoke('cli:probe', payload)) as { ok: boolean; error: { code: string } }

      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('VALIDATION_ERROR')
      expect(probeService.probe).not.toHaveBeenCalled()
    })

    it('never throws across the bridge when the probe service rejects', async () => {
      probeService.probe = vi.fn(async () => {
        throw new Error('probe exploded')
      })

      const result = (await invoke('cli:probe', { provider: 'claude' })) as { ok: boolean; error: { code: string } }

      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('PROBE_FAILED')
    })

    it('logs the unexpected probe failure with its channel name', async () => {
      probeService.probe = vi.fn(async () => {
        throw new Error('probe exploded')
      })

      await invoke('cli:probe', { provider: 'claude' })

      expect(logErrorMock).toHaveBeenCalledWith('cli:probe failed', expect.any(Error))
    })
  })

  describe('cli:setOverride', () => {
    it.each([
      ['a payload missing the provider', { path: 'C:\\tools\\claude.cmd' }],
      ['a payload missing the path key', { provider: 'claude' }],
      ['an empty-string path', { provider: 'claude', path: '' }],
      ['a non-string, non-null path', { provider: 'claude', path: 42 }],
      ['a provider this app has never heard of', { provider: 'ollama', path: 'C:\\tools\\ollama.exe' }],
      // A provider name the write-side gate refuses, so it can never reach a
      // settings key or a spawn. Gemini used to be the real instance of this —
      // described in the table, absent from the enabled list — and every
      // provider the contract now admits is enabled, so the case is carried by
      // a fixture id standing exactly where a disabled one would. The gate
      // itself keeps its own coverage in `shared/ipc/cli.test.ts`.
      ['a provider the enabled gate refuses', { provider: 'fixture-cli', path: 'C:\\tools\\fixture-cli.exe' }]
    ])('rejects %s without persisting or re-probing', async (_label, payload) => {
      const result = (await invoke('cli:setOverride', payload)) as { ok: boolean; error: { code: string } }

      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('VALIDATION_ERROR')
      expect(settingsRepository.set).not.toHaveBeenCalled()
      expect(probeService.probe).not.toHaveBeenCalled()
    })

    // The settings key comes from the provider's own spec, never composed from
    // wire data — a key built from the payload would let a drifted renderer
    // write anywhere in the settings table.
    it('persists under the key the provider table owns, not one built from the payload', async () => {
      await invoke('cli:setOverride', { provider: 'codex', path: 'C:\\tools\\codex.cmd' })

      expect(settingsRepository.set).toHaveBeenCalledWith('codex.executableOverride', 'C:\\tools\\codex.cmd')
    })

    it('persists a null path to clear the override and returns the re-probed status', async () => {
      const result = await invoke('cli:setOverride', { provider: 'codex', path: null })

      expect(settingsRepository.set).toHaveBeenCalledWith('codex.executableOverride', null)
      expect(result).toEqual({ ok: true, data: statusFor('codex') })
    })

    // Re-probing all three would spawn processes for two CLIs the user did not
    // touch, just because they corrected a path in a third.
    it('re-probes only the provider whose override changed', async () => {
      await invoke('cli:setOverride', { provider: 'codex', path: 'C:\\tools\\codex.cmd' })

      expect(probeService.probe).toHaveBeenCalledTimes(1)
      expect(probeService.probe).toHaveBeenCalledWith('codex')
    })

    it('never throws across the bridge when persisting the override fails', async () => {
      settingsRepository.set = vi.fn(() => {
        throw new Error('disk is full')
      })

      const result = (await invoke('cli:setOverride', { provider: 'claude', path: 'C:\\x\\claude.cmd' })) as {
        ok: boolean
        error: { code: string; message: string }
      }

      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('SET_OVERRIDE_FAILED')
      expect(result.error.message).toBe('disk is full')
    })

    it('never throws across the bridge when the re-probe after persisting rejects', async () => {
      probeService.probe = vi.fn(async () => {
        throw new Error('probe exploded')
      })

      const result = (await invoke('cli:setOverride', { provider: 'claude', path: 'C:\\x\\claude.cmd' })) as {
        ok: boolean
        error: { code: string }
      }

      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('SET_OVERRIDE_FAILED')
    })
  })

  // Autodetection is ADDITIVE: the picker keeps its curated models either
  // way, so a catalog that finds nothing and a catalog that throws must both
  // look like an ordinary empty answer rather than an error the panel renders.
  describe('cli:models', () => {
    it('answers the models the CLI state file declares', async () => {
      await expect(invoke('cli:models')).resolves.toEqual({
        ok: true,
        data: [{ provider: 'claude', modelId: 'claude-fable-5[1m]', origin: 'catalog', rank: null }]
      })
    })

    it('answers an empty list rather than throwing when discovery fails', async () => {
      modelCatalog.discover = vi.fn(async () => {
        throw new Error('EPERM')
      })

      await expect(invoke('cli:models')).resolves.toEqual({ ok: true, data: [] })
    })

    // The state file belongs to another program. An id it holds that this
    // build would refuse to spawn must not reach the picker as a clickable row.
    it('drops a discovered id the shared contract refuses', async () => {
      modelCatalog.discover = vi.fn(
        async () =>
          [
            { provider: 'claude', modelId: 'claude sonnet', origin: 'used', rank: null },
            { provider: 'claude', modelId: 'claude-sonnet-5', origin: 'used', rank: null }
          ] as never
      )

      await expect(invoke('cli:models')).resolves.toEqual({
        ok: true,
        data: [{ provider: 'claude', modelId: 'claude-sonnet-5', origin: 'used', rank: null }]
      })
    })
  })

  // The opt-in is a PERMISSION the app persists, distinct from the probe result:
  // it says which CLIs may be spawned, never which ones work.
  describe('registerCliHandlers — the opt-in', () => {
    it('records the opt-in when a probe is requested, before the probe runs', async () => {
      await invoke('cli:probe', { provider: 'codex' })

      expect(settingsRepository.set).toHaveBeenCalledWith('codex.connected', '1')
    })

    // The decision is just as real when the binary turns out to be missing — the
    // row is what makes the screen re-check next launch instead of re-asking.
    it('records it even when the probe answers not-found', async () => {
      probeService.probe = vi.fn(async (provider) => ({ ...statusFor(provider), status: 'not-found' as const }))

      await invoke('cli:probe', { provider: 'claude' })

      expect(settingsRepository.set).toHaveBeenCalledWith('claude.connected', '1')
    })

    // Typing a path is how a student connects a CLI that PATH autodetection
    // cannot find, so it must persist the same way pressing Conectar does.
    it('records it when a manual path is committed', async () => {
      await invoke('cli:setOverride', { provider: 'codex', path: 'C:\tools\codex.cmd' })

      expect(settingsRepository.set).toHaveBeenCalledWith('codex.connected', '1')
    })

    it('reports the opt-in and the saved path of every provider', async () => {
      settings.get = vi.fn((key: string) =>
        key === 'claude.connected' ? '1' : key === 'antigravity.executableOverride' ? 'C:\agy\agy.exe' : null
      )

      await expect(invoke('cli:preferences')).resolves.toEqual({
        ok: true,
        data: [
          { provider: 'claude', connected: true, overridePath: null, lastStatus: null },
          // A saved path WITHOUT the opt-in: exactly the state a returning
          // student is in, and the reason these two fields cannot be folded
          // into one.
          { provider: 'antigravity', connected: false, overridePath: 'C:\agy\agy.exe', lastStatus: null },
          { provider: 'codex', connected: false, overridePath: null, lastStatus: null }
        ]
      })
    })

    it('reports every provider as unconnected and unconfigured on a fresh install', async () => {
      await expect(invoke('cli:preferences')).resolves.toEqual({
        ok: true,
        data: [
          { provider: 'claude', connected: false, overridePath: null, lastStatus: null },
          { provider: 'antigravity', connected: false, overridePath: null, lastStatus: null },
          { provider: 'codex', connected: false, overridePath: null, lastStatus: null }
        ]
      })
    })

    describe('cli:disconnect', () => {
      it('clears the opt-in row', async () => {
        await expect(invoke('cli:disconnect', { provider: 'codex' })).resolves.toEqual({ ok: true, data: undefined })
        expect(settingsRepository.set).toHaveBeenCalledWith('codex.connected', null)
      })

      // `askService` reads the capability cache to decide whether a provider may
      // be spawned, so a stale clearance would let a disconnected CLI answer one
      // more question.
      it('drops whatever the probe had observed', async () => {
        await invoke('cli:disconnect', { provider: 'codex' })

        expect(probeService.forget).toHaveBeenCalledWith('codex')
      })

      // The path is a correction the student typed, not a permission. Discarding
      // it would make reconnecting mean re-finding an install location.
      it('leaves the manual path override in place', async () => {
        await invoke('cli:disconnect', { provider: 'codex' })

        expect(settingsRepository.set).not.toHaveBeenCalledWith('codex.executableOverride', null)
      })

      // The narrow write-side gate exists to stop a payload reaching a spawn.
      // This payload REMOVES a permission to spawn, so refusing a provider this
      // build no longer enables would strand a standing permission.
      it('accepts any provider the contract has ever known', async () => {
        const result = (await invoke('cli:disconnect', { provider: 'antigravity' })) as { ok: boolean }

        expect(result.ok).toBe(true)
      })

      it.each([
        ['an empty payload', {}],
        ['a provider this app has never heard of', { provider: 'ollama' }]
      ])('rejects %s', async (_label, payload) => {
        const result = (await invoke('cli:disconnect', payload)) as { ok: boolean; error: { code: string } }

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('VALIDATION_ERROR')
        expect(settingsRepository.set).not.toHaveBeenCalled()
      })
    })

    // A surface that must not spawn still has to tell a working CLI from one
    // that is merely opted in, so what the probe saw is remembered.
    it('remembers what the probe saw', async () => {
      probeService.probe = vi.fn(async (provider) => ({ ...statusFor(provider), status: 'not-found' as const }))

      await invoke('cli:probe', { provider: 'codex' })

      expect(settingsRepository.set).toHaveBeenCalledWith('codex.lastStatus', 'not-found')
    })

    it('remembers it after a manual path is committed too', async () => {
      await invoke('cli:setOverride', { provider: 'codex', path: 'C:\tools\codex.cmd' })

      expect(settingsRepository.set).toHaveBeenCalledWith('codex.lastStatus', 'connected')
    })

    it('reports the remembered outcome', async () => {
      settings.get = vi.fn((key: string) => (key === 'claude.lastStatus' ? 'unusable' : null))

      const result = (await invoke('cli:preferences')) as { data: { provider: string; lastStatus: string | null }[] }

      expect(result.data[0]).toMatchObject({ provider: 'claude', lastStatus: 'unusable' })
    })

    // A value this build does not recognise is not a status. Passing it through
    // would put a string the renderer cannot map into a typed field.
    it('reports null for a remembered value it does not recognise', async () => {
      settings.get = vi.fn((key: string) => (key === 'claude.lastStatus' ? 'sideways' : null))

      const result = (await invoke('cli:preferences')) as { data: { lastStatus: string | null }[] }

      expect(result.data[0].lastStatus).toBeNull()
    })

    it('forgets the remembered outcome when the CLI is disconnected', async () => {
      await invoke('cli:disconnect', { provider: 'codex' })

      expect(settingsRepository.set).toHaveBeenCalledWith('codex.lastStatus', null)
    })
  })
})
