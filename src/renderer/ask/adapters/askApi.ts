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
  cliStatusResultSchema,
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
 * The SAME key Ajustes uses, so both screens share one cache entry and the
 * CLIs are probed once rather than per surface. Kept here as a constant so the
 * ask slice never imports from the ajustes slice.
 */
export const CLI_STATUS_QUERY_KEY = ['cli', 'status'] as const

/**
 * Its own cache entry, and a long-lived one: the CLI writes its state file
 * when a session ends, so the answer changes between app launches at most.
 * Re-reading it per render would be filesystem traffic for a list that did
 * not move.
 */
export const CLI_MODELS_QUERY_KEY = ['cli', 'models'] as const

export interface AskApi {
  /** `conversationId` continues that thread; omitted starts a new one. The
   * full `AskTurnResponse` is returned, not just `result`, so the container
   * can branch thread selection on its `conversationId` sentinel (design D6). */
  question(question: string, selection: ModelSelection, conversationId?: number): Promise<AskTurnResponse>
  /** Best-effort; never throws, because it runs on panel unmount. */
  cancel(): Promise<void>
  /** One status per supported provider — the panel picks the one it is asking with. */
  status(): Promise<CliProviderStatus[]>
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

  async status() {
    const result = await window.api.cli.status()
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return cliStatusResultSchema.parse(result.data)
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
