import { ipcMain } from 'electron'
import log from 'electron-log'
import {
  CLI_PROVIDERS,
  cliModelsResultSchema,
  cliStatusValueSchema,
  disconnectCliInputSchema,
  ipcErr,
  ipcOk,
  parsePayload,
  probeCliInputSchema,
  setCliOverrideInputSchema,
  type CliPreference,
  type CliProviderStatus,
  type DiscoveredModel,
  type IpcResult
} from '../../../shared/ipc/cli'
import { PROVIDER_SPECS } from '../providerSpec'
import type { AppSettingsPort, CliProbeService } from '../cliProbeService'
import type { ModelCatalog } from '../modelCatalog'

interface RegisterCliHandlersDeps {
  probeService: CliProbeService
  /** Reads the persisted opt-in. The probe service reads paths through its own injected port. */
  settings: AppSettingsPort
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
 * NO channel here probes more than one provider. That is a property of the
 * surface, not a convention: `cli:probe` takes a provider and `cli:setOverride`
 * re-probes only the one it just wrote, so nothing on the main side can spawn a
 * process for a CLI the user did not name.
 *
 * `cli:setOverride` re-probes only the provider that changed. Re-probing all
 * three would spawn two processes the user did not ask about just because they
 * corrected a path in a third.
 */
export function registerCliHandlers({
  probeService,
  settings,
  settingsRepository,
  modelCatalog
}: RegisterCliHandlersDeps): void {
  /**
   * Records what a probe just saw, so a surface that must not spawn can still
   * tell a working CLI from one that is merely opted in.
   *
   * Writing it HERE rather than inside the probe service keeps that service a
   * pure observer: it reports, this decides what is worth remembering.
   */
  const remember = (status: CliProviderStatus): CliProviderStatus => {
    settingsRepository.set(PROVIDER_SPECS[status.provider].statusKey, status.status)
    return status
  }

  /**
   * Probes ONE CLI, and only when the renderer asks for that exact one.
   *
   * This replaced a `cli:status` channel that probed every supported provider
   * at once. The settings screen fired it on mount, so merely opening Ajustes
   * spawned up to six short-lived processes — for CLIs the student may never
   * have installed and never intends to use. Connecting a CLI is a decision
   * now, and this channel is the only way to start one.
   */
  ipcMain.handle('cli:probe', async (_event, payload): Promise<IpcResult<CliProviderStatus>> => {
    const parsed = parsePayload(probeCliInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      // The opt-in is recorded on REQUEST, not on success. What persists is the
      // student's decision to use this CLI, and that decision is just as real
      // when the binary turns out to be missing — the row is what makes the
      // screen re-check it next launch instead of re-asking.
      settingsRepository.set(PROVIDER_SPECS[parsed.data.provider].connectedKey, '1')
      return ipcOk(remember(await probeService.probe(parsed.data.provider)))
    } catch (error) {
      log.error('cli:probe failed', error)
      return ipcErr('PROBE_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  /**
   * What this app has PERSISTED about each CLI: whether it may spawn it, and
   * which path the student pointed it at.
   *
   * A pure settings read — it starts no process, which is what lets both the
   * settings screen and the ask panel call it on open without reintroducing the
   * fan-out that `cli:status` used to cause. It is also the only way a row can
   * show a saved path BEFORE it has been probed: the path lives in settings,
   * while `CliProviderStatus.overridePath` only exists once something ran.
   */
  ipcMain.handle('cli:preferences', async (): Promise<IpcResult<CliPreference[]>> => {
    try {
      return ipcOk(
        CLI_PROVIDERS.map((provider) => ({
          provider,
          connected: settings.get(PROVIDER_SPECS[provider].connectedKey) !== null,
          overridePath: settings.get(PROVIDER_SPECS[provider].overrideKey),
          lastStatus: cliStatusValueSchema.safeParse(settings.get(PROVIDER_SPECS[provider].statusKey)).data ?? null
        }))
      )
    } catch (error) {
      log.error('cli:preferences failed', error)
      return ipcErr('PREFERENCES_READ_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  /**
   * Withdraws the opt-in, and nothing else.
   *
   * The manual path override is deliberately LEFT IN PLACE: it is a correction
   * the student typed, not a permission, and silently discarding it would make
   * reconnecting mean re-finding an install location they already found once.
   *
   * The capability cache is cleared with the row, because `askService` reads it
   * to decide whether a provider may be spawned — leaving a stale clearance
   * behind would let a disconnected CLI answer one more question.
   */
  ipcMain.handle('cli:disconnect', async (_event, payload): Promise<IpcResult<undefined>> => {
    const parsed = parsePayload(disconnectCliInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
    }

    try {
      settingsRepository.set(PROVIDER_SPECS[parsed.data.provider].connectedKey, null)
      // The remembered outcome goes with the permission it was observed under.
      settingsRepository.set(PROVIDER_SPECS[parsed.data.provider].statusKey, null)
      probeService.forget(parsed.data.provider)
      return ipcOk(undefined)
    } catch (error) {
      log.error('cli:disconnect failed', error)
      return ipcErr('DISCONNECT_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('cli:setOverride', async (_event, payload): Promise<IpcResult<CliProviderStatus>> => {
    const parsed = parsePayload(setCliOverrideInputSchema, payload)
    if (!parsed.ok) {
      return parsed.failure
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
      // Committing a path is itself an opt-in: it is how a student connects a
      // CLI that PATH autodetection cannot find, so it must persist the same
      // way pressing "Conectar" does.
      settingsRepository.set(PROVIDER_SPECS[parsed.data.provider].connectedKey, '1')
      return ipcOk(remember(await probeService.probe(parsed.data.provider)))
    } catch (error) {
      log.error('cli:setOverride failed', error)
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
