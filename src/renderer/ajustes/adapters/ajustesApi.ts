// IPC-backed port implementation (design D8) — crosses the preload bridge
// via `window.api.cli`, then Zod-parses the response before handing typed
// data to TanStack Query. Same two-directional parsing rule as every other
// adapter in the repo (`adjuntosApi.ts`).
import {
  cliProviderStatusSchema,
  cliStatusResultSchema,
  type CliProviderStatus,
  type SetCliOverrideInput
} from '../../../shared/ipc/cli'

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

export interface AjustesApi {
  /** One status per supported provider, in menu order. */
  status(): Promise<CliProviderStatus[]>
  /** Returns ONLY the re-probed provider — the caller merges it into the list. */
  setOverride(input: SetCliOverrideInput): Promise<CliProviderStatus>
}

export const ajustesApi: AjustesApi = {
  async status() {
    const result = await window.api.cli.status()
    if (!result.ok) {
      throw new AjustesApiError(result.error.code, result.error.message)
    }
    return cliStatusResultSchema.parse(result.data)
  },
  async setOverride(input) {
    const result = await window.api.cli.setOverride(input)
    if (!result.ok) {
      throw new AjustesApiError(result.error.code, result.error.message)
    }
    return cliProviderStatusSchema.parse(result.data)
  }
}
