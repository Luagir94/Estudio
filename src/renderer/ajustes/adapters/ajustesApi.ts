// IPC-backed port implementation (design D8) — crosses the preload bridge
// via `window.api.cli`, then Zod-parses the response before handing typed
// data to TanStack Query. Same two-directional parsing rule as every other
// adapter in the repo (`adjuntosApi.ts`).
import {
  cliPreferencesResultSchema,
  cliProviderStatusSchema,
  type CliPreference,
  type CliProvider,
  type CliProviderStatus,
  type DisconnectCliInput,
  type ProbeCliInput,
  type SetCliOverrideInput
} from '../../../shared/ipc/cli'

/**
 * One cache entry PER PROVIDER, not one for the whole screen.
 *
 * The screen used to hold a single `['cli', 'status']` entry filled by a probe
 * of every CLI at once. Splitting it is what lets a card exist in three honest
 * states — never asked, asking, answered — independently of its neighbours:
 * with a shared entry, connecting one CLI would have had to invent values for
 * the two nobody touched.
 *
 * Exported because the ask panel reads the SAME entry for the provider it is
 * about to ask with, so a CLI connected in Ajustes is not re-probed there.
 */
export function cliStatusQueryKey(provider: CliProvider): readonly [string, string, CliProvider] {
  return ['cli', 'status', provider]
}

// The bridge never throws — it resolves an `IpcResult` envelope. This error
// preserves the envelope's typed `code` across the throw, unlike a plain
// `Error`, exactly like `AdjuntosApiError`.
export class AjustesApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AjustesApiError'
    this.code = code
  }
}

/**
 * What the app has PERSISTED per CLI, shared with the ask panel through this
 * one key.
 *
 * It is NOT a status: it says which CLIs this app may spawn and which path the
 * student pointed each at, never which ones work. Its own cache entry is what
 * lets a screen answer both questions without probing anything.
 */
export const CLI_PREFERENCES_QUERY_KEY = ['cli', 'preferences'] as const

export interface AjustesApi {
  /** Probes ONE CLI. Called from a button, or on open for a CLI already connected. */
  probe(input: ProbeCliInput): Promise<CliProviderStatus>
  /** Returns ONLY the re-probed provider. */
  setOverride(input: SetCliOverrideInput): Promise<CliProviderStatus>
  /** The opt-in and saved path of every CLI. A settings read — it starts no process. */
  preferences(): Promise<CliPreference[]>
  /** Withdraws the opt-in for one provider. */
  disconnect(input: DisconnectCliInput): Promise<void>
}

export const ajustesApi: AjustesApi = {
  async probe(input) {
    const result = await window.api.cli.probe(input)
    if (!result.ok) {
      throw new AjustesApiError(result.error.code, result.error.message)
    }
    return cliProviderStatusSchema.parse(result.data)
  },
  async setOverride(input) {
    const result = await window.api.cli.setOverride(input)
    if (!result.ok) {
      throw new AjustesApiError(result.error.code, result.error.message)
    }
    return cliProviderStatusSchema.parse(result.data)
  },
  async preferences() {
    const result = await window.api.cli.preferences()
    if (!result.ok) {
      throw new AjustesApiError(result.error.code, result.error.message)
    }
    return cliPreferencesResultSchema.parse(result.data)
  },
  async disconnect(input) {
    const result = await window.api.cli.disconnect(input)
    if (!result.ok) {
      throw new AjustesApiError(result.error.code, result.error.message)
    }
  }
}
