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

vi.mock('electron', () => ({ ipcMain: ipcMainMock }))

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
  let modelCatalog: ModelCatalog

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    vi.clearAllMocks()
    probeService = {
      probeAll: vi.fn(async () => [statusFor('claude'), statusFor('codex')]),
      probe: vi.fn(async (provider) => statusFor(provider)),
      capabilities: vi.fn(() => null)
    }
    settingsRepository = { set: vi.fn() }
    modelCatalog = {
      discover: vi.fn(async () => [
        { provider: 'claude' as const, modelId: 'claude-fable-5[1m]', origin: 'catalog' as const, rank: null }
      ])
    }
    registerCliHandlers({ probeService, settingsRepository, modelCatalog })
  })

  describe('cli:status', () => {
    it('returns one status per supported provider in the ok envelope', async () => {
      const result = await invoke('cli:status')

      expect(result).toEqual({ ok: true, data: [statusFor('claude'), statusFor('codex')] })
    })

    it('never throws across the bridge when the probe service rejects', async () => {
      probeService.probeAll = vi.fn(async () => {
        throw new Error('probe exploded')
      })

      const result = (await invoke('cli:status')) as { ok: boolean; error: { code: string } }

      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('PROBE_FAILED')
    })
  })

  describe('cli:setOverride', () => {
    it.each([
      ['a payload missing the provider', { path: 'C:\\tools\\claude.cmd' }],
      ['a payload missing the path key', { provider: 'claude' }],
      ['an empty-string path', { provider: 'claude', path: '' }],
      ['a non-string, non-null path', { provider: 'claude', path: 42 }],
      ['a provider this app does not support', { provider: 'ollama', path: 'C:\\tools\\ollama.exe' }],
      // Disabled, not unknown: the spec still exists, but the write-side schema
      // refuses it so it can never reach a settings key or a spawn.
      ['a provider that is disabled in this build', { provider: 'gemini', path: 'C:\\tools\\gemini.cmd' }]
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
      expect(probeService.probeAll).not.toHaveBeenCalled()
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
})
