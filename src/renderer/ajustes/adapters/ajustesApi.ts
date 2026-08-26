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
import {
  paletteSchema,
  themePreferenceSchema,
  type Palette,
  type SetPaletteInput,
  type SetThemePreferenceInput,
  type ThemePreference
} from '../../../shared/ipc/theme'
import { assertIpcOk, IpcApiError, unwrapIpcResult } from '../../shared/adapters/ipcApiError'

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
export class AjustesApiError extends IpcApiError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'AjustesApiError'
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

/** The persisted theme preference. A settings read like the entry above — it starts no process. */
export const THEME_PREFERENCE_QUERY_KEY = ['theme', 'preference'] as const

/**
 * The persisted palette, in its OWN entry beside the preference rather than
 * sharing one.
 *
 * They are two independent axes — light/dark and which hues that scheme uses —
 * persisted under two settings rows and answered by two channels. One shared
 * entry would have forced a write to either half to invent a value for the
 * other, the same reason the CLI statuses above are keyed per provider.
 */
export const PALETTE_QUERY_KEY = ['theme', 'palette'] as const

export interface AjustesApi {
  /** Probes ONE CLI. Called from a button, or on open for a CLI already connected. */
  probe(input: ProbeCliInput): Promise<CliProviderStatus>
  /** Returns ONLY the re-probed provider. */
  setOverride(input: SetCliOverrideInput): Promise<CliProviderStatus>
  /** The opt-in and saved path of every CLI. A settings read — it starts no process. */
  preferences(): Promise<CliPreference[]>
  /** Withdraws the opt-in for one provider. */
  disconnect(input: DisconnectCliInput): Promise<void>
  /** The persisted theme preference — `system` for a profile that never chose. */
  themePreference(): Promise<ThemePreference>
  /** Applies AND persists in one round trip, echoing the persisted value. */
  setThemePreference(input: SetThemePreferenceInput): Promise<ThemePreference>
  /** The persisted palette — `amatista` for a profile that never chose. */
  palette(): Promise<Palette>
  /** Persists and echoes. Putting it on `<html>` is `applyPalette`'s job, not the bridge's. */
  setPalette(input: SetPaletteInput): Promise<Palette>
}

export const ajustesApi: AjustesApi = {
  async probe(input) {
    return unwrapIpcResult(await window.api.cli.probe(input), cliProviderStatusSchema, AjustesApiError)
  },
  async setOverride(input) {
    return unwrapIpcResult(await window.api.cli.setOverride(input), cliProviderStatusSchema, AjustesApiError)
  },
  async preferences() {
    return unwrapIpcResult(await window.api.cli.preferences(), cliPreferencesResultSchema, AjustesApiError)
  },
  async disconnect(input) {
    assertIpcOk(await window.api.cli.disconnect(input), AjustesApiError)
  },
  async themePreference() {
    return unwrapIpcResult(await window.api.theme.getPreference(), themePreferenceSchema, AjustesApiError)
  },
  async setThemePreference(input) {
    return unwrapIpcResult(await window.api.theme.setPreference(input), themePreferenceSchema, AjustesApiError)
  },
  async palette() {
    return unwrapIpcResult(await window.api.theme.getPalette(), paletteSchema, AjustesApiError)
  },
  async setPalette(input) {
    return unwrapIpcResult(await window.api.theme.setPalette(input), paletteSchema, AjustesApiError)
  }
}
