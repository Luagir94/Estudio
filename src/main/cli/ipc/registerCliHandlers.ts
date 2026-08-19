import { ipcMain } from 'electron'
import {
  cliModelsResultSchema,
  ipcErr,
  ipcOk,
  setCliOverrideInputSchema,
  type CliProviderStatus,
  type DiscoveredModel,
  type IpcResult
} from '../../../shared/ipc/cli'
import { PROVIDER_SPECS } from '../providerSpec'
import type { CliProbeService } from '../cliProbeService'
import type { ModelCatalog } from '../modelCatalog'

interface RegisterCliHandlersDeps {
  probeService: CliProbeService
  /** Only the write side is needed here — the probe service reads through its own injected `AppSettingsPort`. */
  settingsRepository: { set(key: string, value: string | null): void }
  /** Reads the installed CLI's own state to find models this app never hardcoded. */
  modelCatalog: ModelCatalog
}

/**
 * Registers the `cli:*` main-process handlers, replacing the single-provider
 * `claude:*` pair. Every branch returns an `IpcResult` — nothing ever throws
 * across the bridge, and the status mapping is NOT re-derived here: it lives
 * entirely in `cliProbeService`.
 *
 * `cli:setOverride` re-probes only the provider that changed. Re-probing all
 * three would spawn two processes the user did not ask about just because they
 * corrected a path in a third.
 */
export function registerCliHandlers({ probeService, settingsRepository, modelCatalog }: RegisterCliHandlersDeps): void {
  ipcMain.handle('cli:status', async (): Promise<IpcResult<CliProviderStatus[]>> => {
    try {
      return ipcOk(await probeService.probeAll())
    } catch (error) {
      return ipcErr('PROBE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('cli:setOverride', async (_event, payload): Promise<IpcResult<CliProviderStatus>> => {
    const parsed = setCliOverrideInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      // Validation gates the SPAWN, not the save: the save always succeeds
      // here, honestly reflecting exactly what the user typed. `null` deletes
      // the row rather than storing an empty string.
      //
      // The key comes from the provider's own spec, never from the payload —
      // a settings key composed from wire data would let a drifted renderer
      // write anywhere in the settings table.
      settingsRepository.set(PROVIDER_SPECS[parsed.data.provider].overrideKey, parsed.data.path)
      return ipcOk(await probeService.probe(parsed.data.provider))
    } catch (error) {
      return ipcErr('SET_OVERRIDE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  /**
   * The models the INSTALLED CLI can actually be asked for.
   *
   * This channel exists because the CLI cannot be interrogated. Verified
   * against the installed binary: `claude` has no `models` subcommand, and
   * typing one is read as a prompt that spends the student usage to print a
   * table that only looks like an answer. So the catalog reads the state the
   * CLI already wrote for itself, which costs nothing.
   *
   * It NEVER reports an error. Discovery is additive — the picker keeps its
   * curated models and its free-text field regardless — so a missing file, a
   * locked one, or a drifted schema is an empty list, not something the panel
   * has to explain to a student who did nothing wrong.
   *
   * The result is re-parsed through the SHARED schema on the way out, so an
   * id the spawn boundary would refuse cannot become a clickable row. Zod
   * strips the offending entry rather than the whole answer: one unusable id
   * in another program state file must not cost the user the other three.
   */
  ipcMain.handle('cli:models', async (): Promise<IpcResult<DiscoveredModel[]>> => {
    try {
      const discovered = await modelCatalog.discover()
      return ipcOk(discovered.filter((entry) => cliModelsResultSchema.element.safeParse(entry).success))
    } catch {
      return ipcOk([])
    }
  })
}
