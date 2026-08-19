import { ipcMain } from 'electron'
import {
  askQuestionInputSchema,
  deleteConversationInputSchema,
  getConversationInputSchema,
  ipcErr,
  ipcOk,
  type AskTurnResponse,
  type ConversationSummary,
  type DeleteConversationResult,
  type GetConversationResult,
  type IpcResult
} from '../../../shared/ipc/ask'
import type { AskHistoryRepository } from '../adapters/sqliteAskHistoryRepository'
import { computeTranscriptWindow, type TranscriptSourceTurn } from '../domain/transcriptWindow'
import type { AskService } from '../askService'

interface RegisterAskHandlersDeps {
  askService: AskService
  askHistoryRepository: AskHistoryRepository
}

/**
 * Registers the `ask:*` handlers (design D5/D6). All four channels are
 * invoke/`IpcResult` — this domain has no push events, so `channels.ts`
 * (which exists for the sandboxed preload's runtime constants) is untouched.
 *
 * Nothing throws across the bridge and no branch is re-derived here: the
 * typed outcomes belong to `askService`, and this layer only parses the
 * request, forwards, and preserves the error CODE the renderer maps its
 * Spanish copy from. The one exception is the boundary marker on
 * `ask:getConversation`, which is pure-function GLUE — composing the
 * repository's own turns through the SAME `computeTranscriptWindow`
 * `askService` uses to build the prompt (design D2) — not a re-derivation
 * of any outcome branch.
 */
export function registerAskHandlers({ askService, askHistoryRepository }: RegisterAskHandlersDeps): void {
  ipcMain.handle('ask:question', async (_event, payload): Promise<IpcResult<AskTurnResponse>> => {
    const parsed = askQuestionInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const outcome = await askService.ask(
        parsed.data.question,
        // The wire carries provider and model as sibling fields; the service
        // takes them as one value, because neither means anything alone.
        { provider: parsed.data.provider, modelId: parsed.data.model },
        parsed.data.conversationId
      )
      // `message` is a technical detail or the offending file names — the
      // renderer owns every user-facing string, keyed off the code.
      return outcome.ok
        ? ipcOk({ conversationId: outcome.conversationId, result: outcome.data })
        : ipcErr(outcome.code, outcome.message ?? outcome.code)
    } catch (error) {
      // The service maps its own failures; anything reaching here is
      // unexpected, and must still cross as a typed outcome rather than a
      // rejected promise the renderer would see as an unhandled error.
      return ipcErr('EXECUTION_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('ask:cancel', (): IpcResult<undefined> => {
    // Fired on panel unmount too, where nothing may be in flight — the
    // service's own no-op guard is what keeps that honest.
    askService.cancel()
    return ipcOk(undefined)
  })

  ipcMain.handle('ask:listConversations', (): IpcResult<ConversationSummary[]> => {
    try {
      // Ordering is the repository's own contract (`updatedAt DESC, id
      // DESC`, design D4) — forwarded untouched, never re-sorted here.
      return ipcOk(askHistoryRepository.listConversations())
    } catch (error) {
      return ipcErr('EXECUTION_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('ask:getConversation', (_event, payload): IpcResult<GetConversationResult> => {
    const parsed = getConversationInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      const found = askHistoryRepository.getConversation(parsed.data.id)
      if (!found) {
        return ipcErr('NOT_FOUND', `No conversation with id ${parsed.data.id}`)
      }

      // The SAME source of truth `askService` feeds into the prompt (design
      // D2) — a second, independently written computation here would silently
      // reintroduce the exact marker/prompt drift that function exists to
      // prevent.
      const turns: TranscriptSourceTurn[] = found.messages.map((message) => ({
        messageId: message.id,
        question: message.question,
        result: message.result
      }))
      const { startMessageId, excludedCount } = computeTranscriptWindow(turns)

      return ipcOk({
        conversation: found.conversation,
        messages: found.messages,
        window: { startMessageId, excludedCount }
      })
    } catch (error) {
      return ipcErr('EXECUTION_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  ipcMain.handle('ask:deleteConversation', (_event, payload): IpcResult<DeleteConversationResult> => {
    const parsed = deleteConversationInputSchema.safeParse(payload)
    if (!parsed.success) {
      return ipcErr('VALIDATION_ERROR', parsed.error.issues.map((issue) => issue.message).join('; '))
    }

    try {
      // Cascade (messages + citations) is the repository's own job via
      // `ON DELETE CASCADE` (design D4) — this handler only forwards the id.
      const removed = askHistoryRepository.deleteConversation(parsed.data.id)
      if (!removed) {
        return ipcErr('NOT_FOUND', `No conversation with id ${parsed.data.id}`)
      }

      return ipcOk({ id: parsed.data.id })
    } catch (error) {
      return ipcErr('EXECUTION_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })
}
