// IPC-backed port for the ask panel (design D7). Crosses the preload bridge,
// then Zod-parses the response before it reaches TanStack Query — the
// renderer half of the two-sided parsing rule. A drifted or citation-less
// answer fails HERE rather than rendering as a trustworthy one.
import {
  askErrorCodeSchema,
  askTurnResponseSchema,
  deleteConversationResultSchema,
  getConversationResultSchema,
  listConversationsResultSchema,
  type AskErrorCode,
  type AskTurnResponse,
  type ConversationSummary,
  type DeleteConversationResult,
  type GetConversationResult
} from '../../../shared/ipc/ask'
import type { ModelSelection } from '../../../shared/ipc/cli'
import {
  cliModelsResultSchema,
  cliPreferencesResultSchema,
  cliProviderStatusSchema,
  type CliPreference,
  type CliProvider,
  type CliProviderStatus,
  type DiscoveredModel
} from '../../../shared/ipc/cli'

/**
 * Carries the typed code across the throw. A plain `Error` would erase it,
 * and the code is exactly what the panel maps its Spanish copy from.
 */
export class AskApiError extends Error {
  readonly code: AskErrorCode

  constructor(code: AskErrorCode, message: string) {
    super(message)
    this.name = 'AskApiError'
    this.code = code
  }
}

/**
 * The SAME key Ajustes uses, per provider, so a CLI already connected there is
 * not probed a second time here. Kept as a local function so the ask slice
 * never imports from the ajustes slice.
 *
 * Per PROVIDER, because this panel only ever reads the status of the one CLI
 * it is about to ask with. It used to fetch a list of all three to then throw
 * two of them away — six short-lived processes to answer a question about one.
 */
export function cliStatusQueryKey(provider: CliProvider): readonly [string, string, CliProvider] {
  return ['cli', 'status', provider]
}

/**
 * Its own cache entry, and a long-lived one: the CLI writes its state file
 * when a session ends, so the answer changes between app launches at most.
 * Re-reading it per render would be filesystem traffic for a list that did
 * not move.
 */
export const CLI_MODELS_QUERY_KEY = ['cli', 'models'] as const

/**
 * The SAME key Ajustes uses for the persisted preferences, so connecting a CLI
 * over there is reflected here without a second read.
 *
 * The panel needs it for two different jobs: deciding whether it can be used at
 * all, and deciding which CLIs' models are worth offering. Both are questions
 * about PERMISSION, not about health, which is why neither is answered by a
 * probe.
 */
export const CLI_PREFERENCES_QUERY_KEY = ['cli', 'preferences'] as const

export interface AskApi {
  /** `conversationId` continues that thread; omitted starts a new one. The
   * full `AskTurnResponse` is returned, not just `result`, so the container
   * can branch thread selection on its `conversationId` sentinel (design D6). */
  question(question: string, selection: ModelSelection, conversationId?: number): Promise<AskTurnResponse>
  /** Best-effort; never throws, because it runs on panel unmount. */
  cancel(): Promise<void>
  /** Probes ONLY the provider the panel is about to ask with. */
  probe(provider: CliProvider): Promise<CliProviderStatus>
  /** The opt-in and saved path of every CLI. A settings read — it starts no process. */
  preferences(): Promise<CliPreference[]>
  /** Models read out of the installed CLI's own state. Never throws — an empty list means nothing was found. */
  models(): Promise<DiscoveredModel[]>
  listConversations(): Promise<ConversationSummary[]>
  getConversation(id: number): Promise<GetConversationResult>
  deleteConversation(id: number): Promise<DeleteConversationResult>
}

export const askApi: AskApi = {
  async question(question, selection, conversationId) {
    const result = await window.api.ask.question({
      question,
      provider: selection.provider,
      model: selection.modelId,
      ...(conversationId !== undefined ? { conversationId } : {})
    })
    if (!result.ok) {
      // An unrecognized code means main drifted ahead of the renderer;
      // degrade to the generic failure rather than crash on the lookup.
      const parsed = askErrorCodeSchema.safeParse(result.error.code)
      throw new AskApiError(parsed.success ? parsed.data : 'EXECUTION_FAILED', result.error.message)
    }
    return askTurnResponseSchema.parse(result.data)
  },

  async cancel() {
    await window.api.ask.cancel()
  },

  async preferences() {
    const result = await window.api.cli.preferences()
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return cliPreferencesResultSchema.parse(result.data)
  },

  async probe(provider) {
    const result = await window.api.cli.probe({ provider })
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return cliProviderStatusSchema.parse(result.data)
  },

  async models() {
    const result = await window.api.cli.models()
    // Discovery is additive, so a failure is INDISTINGUISHABLE from finding
    // nothing — both leave the picker exactly as it was. Throwing here would
    // turn another program's missing file into an error state on a panel the
    // student can use perfectly well.
    if (!result.ok) return []
    const parsed = cliModelsResultSchema.safeParse(result.data)
    return parsed.success ? parsed.data : []
  },

  async listConversations() {
    const result = await window.api.ask.listConversations()
    if (!result.ok) {
      const parsed = askErrorCodeSchema.safeParse(result.error.code)
      throw new AskApiError(parsed.success ? parsed.data : 'EXECUTION_FAILED', result.error.message)
    }
    return listConversationsResultSchema.parse(result.data)
  },

  async getConversation(id) {
    const result = await window.api.ask.getConversation({ id })
    if (!result.ok) {
      const parsed = askErrorCodeSchema.safeParse(result.error.code)
      throw new AskApiError(parsed.success ? parsed.data : 'EXECUTION_FAILED', result.error.message)
    }
    return getConversationResultSchema.parse(result.data)
  },

  async deleteConversation(id) {
    const result = await window.api.ask.deleteConversation({ id })
    if (!result.ok) {
      const parsed = askErrorCodeSchema.safeParse(result.error.code)
      throw new AskApiError(parsed.success ? parsed.data : 'EXECUTION_FAILED', result.error.message)
    }
    return deleteConversationResultSchema.parse(result.data)
  }
}
