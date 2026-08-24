import { beforeEach, describe, expect, it, vi } from 'vitest'
import { askTurnResponseSchema, type AskResult, type AskTurnResponse } from '../../../shared/ipc/ask'
import type {
  AskHistoryRepository,
  AskHistoryMessage,
  ConversationSummary
} from '../adapters/sqliteAskHistoryRepository'
import { computeTranscriptWindow, type TranscriptSourceTurn } from '../domain/transcriptWindow'
import type { AskService } from '../askService'

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

import { registerAskHandlers } from './registerAskHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

/** In-memory `AskHistoryRepository` double — this file never touches SQLite. */
function createFakeHistoryRepository(overrides: Partial<AskHistoryRepository> = {}): AskHistoryRepository {
  return {
    appendTurn: vi.fn(),
    listConversations: vi.fn(() => []),
    getConversation: vi.fn(() => null),
    deleteConversation: vi.fn(() => false),
    ...overrides
  }
}

/**
 * Handler-only tests (design D6): all four channels are invoke/`IpcResult`,
 * zod parses the request side here, and NOTHING ever throws across the
 * bridge. The typed outcomes `askService` itself produces are exhaustively
 * tested there — this file proves the handlers forward them faithfully,
 * preserve the error CODE the renderer maps its copy from, and (for the new
 * read channels) compose the repository's own rows without re-deriving any
 * branch (`registerAskHandlers.ts`'s own thin-handler convention).
 */
describe('registerAskHandlers', () => {
  let askService: AskService
  let askHistoryRepository: AskHistoryRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()

    askService = { ask: vi.fn(), cancel: vi.fn() }
    askHistoryRepository = createFakeHistoryRepository()
    registerAskHandlers({ askService, askHistoryRepository })
  })

  describe('ask:question', () => {
    // Design D5 — the turn response wraps the result with the conversation
    // it landed in; `registerAskHandlers.ts:27` used to drop `conversationId`
    // entirely, silently discarding it before it ever reached the renderer.
    it('returns the answer wrapped with its conversation id in the turn envelope [D5]', async () => {
      const data: AskResult = {
        kind: 'answer',
        answer: 'Está en la clase 3.',
        citations: [{ kind: 'archivo', subject: 'Física', file: 'a.pdf' }]
      }
      vi.mocked(askService.ask).mockResolvedValue({ ok: true, data, conversationId: 5, messageId: 42 })

      const result = await invoke('ask:question', {
        question: '¿Dónde está la fórmula?',
        provider: 'claude',
        model: 'claude-sonnet-5'
      })

      expect(result).toEqual({ ok: true, data: { conversationId: 5, result: data } })
      expect(askService.ask).toHaveBeenCalledWith(
        '¿Dónde está la fórmula?',
        { provider: 'claude', modelId: 'claude-sonnet-5' },
        undefined
      )
    })

    // A write failure is per-turn honesty (design D1) — `null` must survive
    // the crossing unchanged, never coerced into a thrown error or dropped.
    it('carries a null conversationId through untouched when the service reports a write failure', async () => {
      const data: AskResult = { kind: 'not-found' }
      vi.mocked(askService.ask).mockResolvedValue({ ok: true, data, conversationId: null, messageId: null })

      const result = await invoke('ask:question', {
        question: '¿Y esto?',
        provider: 'claude',
        model: 'claude-sonnet-5'
      })

      expect(result).toEqual({ ok: true, data: { conversationId: null, result: data } })
    })

    // The continuation half of D5: an incoming `conversationId` must reach
    // the service, not just survive the RESPONSE side.
    it('forwards a given conversationId through to the service for a continued thread [AM2]', async () => {
      vi.mocked(askService.ask).mockResolvedValue({
        ok: true,
        data: { kind: 'not-found' },
        conversationId: 7,
        messageId: 1000
      })

      await invoke('ask:question', {
        question: '¿Y un cuerpo?',
        provider: 'claude',
        model: 'claude-sonnet-5',
        conversationId: 7
      })

      expect(askService.ask).toHaveBeenCalledWith(
        '¿Y un cuerpo?',
        { provider: 'claude', modelId: 'claude-sonnet-5' },
        7
      )
    })

    it('rejects an empty question with VALIDATION_ERROR without reaching the service', async () => {
      const result = await invoke('ask:question', { question: '', provider: 'claude', model: 'claude-sonnet-5' })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(askService.ask).not.toHaveBeenCalled()
    })

    it('rejects a payload that is not an object without reaching the service', async () => {
      const result = await invoke('ask:question', 'just a string')

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(askService.ask).not.toHaveBeenCalled()
    })

    // The renderer picks its Spanish copy off the CODE, so a code that gets
    // flattened in transit silently becomes the wrong message on screen.
    it.each(['CLI_NOT_FOUND', 'BUSY', 'TIMEOUT', 'MALFORMED_RESPONSE', 'CANCELED'] as const)(
      'forwards the %s code through the err envelope',
      async (code) => {
        vi.mocked(askService.ask).mockResolvedValue({ ok: false, code })

        const result = await invoke('ask:question', {
          question: '¿Y esto?',
          provider: 'claude',
          model: 'claude-sonnet-5'
        })

        expect(result).toMatchObject({ ok: false, error: { code } })
      }
    )

    it('preserves the offending file names carried by OVERSIZED_ATTACHMENT', async () => {
      vi.mocked(askService.ask).mockResolvedValue({
        ok: false,
        code: 'OVERSIZED_ATTACHMENT',
        message: 'enorme.pdf, gigante.pdf'
      })

      const result = await invoke('ask:question', {
        question: '¿Y esto?',
        provider: 'claude',
        model: 'claude-sonnet-5'
      })

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'OVERSIZED_ATTACHMENT', message: 'enorme.pdf, gigante.pdf' }
      })
    })

    // cli-generated-artifacts Unit 7.6/7.7 — the artifact report must pass
    // through the turn envelope unchanged and stay schema-valid on the SAME
    // shared `askTurnResponseSchema` both processes parse against.
    it('passes an artifact report through the turn envelope, matching askTurnResponseSchema [artifact]', async () => {
      const data: AskResult = { kind: 'not-found' }
      const artifact: NonNullable<AskTurnResponse['artifact']> = {
        status: 'saved',
        fileName: 'resumen.md',
        subjectName: 'Álgebra'
      }
      vi.mocked(askService.ask).mockResolvedValue({ ok: true, data, conversationId: 5, messageId: 42, artifact })

      const result = await invoke('ask:question', {
        question: '¿Y esto?',
        provider: 'claude',
        model: 'claude-sonnet-5'
      })

      expect(result).toEqual({ ok: true, data: { conversationId: 5, result: data, artifact } })
      expect(askTurnResponseSchema.safeParse((result as { ok: true; data: unknown }).data).success).toBe(true)
    })

    it('omits the artifact field entirely when the service reports none, staying schema-valid [artifact]', async () => {
      const data: AskResult = { kind: 'not-found' }
      vi.mocked(askService.ask).mockResolvedValue({ ok: true, data, conversationId: 5, messageId: 42 })

      const result = await invoke('ask:question', {
        question: '¿Y esto?',
        provider: 'claude',
        model: 'claude-sonnet-5'
      })

      expect(result).toEqual({ ok: true, data: { conversationId: 5, result: data } })
      expect('artifact' in (result as { ok: true; data: object }).data).toBe(false)
      expect(askTurnResponseSchema.safeParse((result as { ok: true; data: unknown }).data).success).toBe(true)
    })

    // A rejected promise crossing the bridge would surface in the renderer as
    // an unhandled error instead of a typed, mappable outcome.
    it('converts an unexpected service rejection into EXECUTION_FAILED rather than throwing', async () => {
      vi.mocked(askService.ask).mockRejectedValue(new Error('boom'))

      const result = await invoke('ask:question', {
        question: '¿Y esto?',
        provider: 'claude',
        model: 'claude-sonnet-5'
      })

      expect(result).toMatchObject({ ok: false, error: { code: 'EXECUTION_FAILED', message: 'boom' } })
    })

    it('logs the unexpected service rejection with its channel name', async () => {
      vi.mocked(askService.ask).mockRejectedValue(new Error('boom'))

      await invoke('ask:question', {
        question: '¿Y esto?',
        provider: 'claude',
        model: 'claude-sonnet-5'
      })

      expect(logErrorMock).toHaveBeenCalledWith('ask:question failed', expect.any(Error))
    })
  })

  describe('ask:cancel', () => {
    it('cancels the in-flight question and returns the ok envelope', async () => {
      const result = await invoke('ask:cancel')

      expect(askService.cancel).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ ok: true, data: undefined })
    })

    // Cancel is fired on panel unmount, when there may well be nothing in
    // flight — it must stay a safe no-op rather than surface an error.
    it('stays ok when cancelling with nothing in flight', async () => {
      vi.mocked(askService.cancel).mockImplementation(() => {})

      const result = await invoke('ask:cancel')

      expect(result).toMatchObject({ ok: true })
    })
  })

  describe('ask:listConversations', () => {
    // Ordering is the repository's own contract (`updatedAt DESC, id DESC`,
    // design D4) — the handler forwards it untouched, never re-sorting [AH5].
    it('returns the repository conversations in the order it provides them [AH5]', async () => {
      const summaries: ConversationSummary[] = [
        { id: 2, title: 'Segunda', createdAt: '2026-08-18T09:05', updatedAt: '2026-08-18T09:10' },
        { id: 1, title: 'Primera', createdAt: '2026-08-18T09:00', updatedAt: '2026-08-18T09:00' }
      ]
      askHistoryRepository = createFakeHistoryRepository({ listConversations: vi.fn(() => summaries) })
      registerAskHandlers({ askService, askHistoryRepository })

      const result = await invoke('ask:listConversations')

      expect(result).toEqual({ ok: true, data: summaries })
    })
  })

  describe('ask:getConversation', () => {
    it('rejects a non-positive id with VALIDATION_ERROR without reaching the repository', async () => {
      const result = await invoke('ask:getConversation', { id: 0 })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(askHistoryRepository.getConversation).not.toHaveBeenCalled()
    })

    it('returns NOT_FOUND when the conversation does not exist', async () => {
      const result = await invoke('ask:getConversation', { id: 999 })

      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })

    // The file's own doc comment (`registerAskHandlers.ts:28`) states
    // "Nothing throws across the bridge" — a SQLite throw here must still
    // cross as a typed `IpcResult`, matching `ask:question`/`ask:listConversations`.
    it('converts an unexpected repository throw into EXECUTION_FAILED rather than throwing', async () => {
      askHistoryRepository = createFakeHistoryRepository({
        getConversation: vi.fn(() => {
          throw new Error('disk I/O error')
        })
      })
      registerAskHandlers({ askService, askHistoryRepository })

      const result = await invoke('ask:getConversation', { id: 1 })

      expect(result).toMatchObject({ ok: false, error: { code: 'EXECUTION_FAILED', message: 'disk I/O error' } })
    })

    // Full transcript, chronological order, straight from the repository [AH6].
    it('returns the full conversation and its messages when everything fits the window', async () => {
      const conversation: ConversationSummary = {
        id: 1,
        title: '¿Qué es un anillo?',
        createdAt: '2026-08-18T09:00',
        updatedAt: '2026-08-18T09:00'
      }
      const message: AskHistoryMessage = {
        id: 1000,
        question: '¿Qué es un anillo?',
        model: 'sonnet',
        result: { kind: 'not-found' },
        createdAt: '2026-08-18T09:00'
      }
      askHistoryRepository = createFakeHistoryRepository({
        getConversation: vi.fn(() => ({ conversation, messages: [message] }))
      })
      registerAskHandlers({ askService, askHistoryRepository })

      const result = await invoke('ask:getConversation', { id: 1 })

      expect(result).toEqual({
        ok: true,
        data: { conversation, messages: [message], window: { startMessageId: 1000, excludedCount: 0 } }
      })
    })

    // Design D2/CM5: the marker MUST come from the SAME `computeTranscriptWindow`
    // call `askService` uses to build the prompt — a second, independently
    // written computation here would silently reintroduce drift between what
    // the model actually saw and what the transcript UI marks as excluded.
    it('composes the boundary marker from the SAME computeTranscriptWindow call the service uses, over the same fixture — drift test [CM5]', async () => {
      const conversation: ConversationSummary = {
        id: 9,
        title: 'Larga',
        createdAt: '2026-08-18T09:00',
        updatedAt: '2026-08-18T09:03'
      }
      // Four turns whose combined size exceeds the 24,000-char budget, so
      // the fixture genuinely forces exclusion rather than a trivial
      // zero-exclusion default either computation could echo by accident.
      const messages: AskHistoryMessage[] = Array.from({ length: 4 }, (_, index) => ({
        id: 1000 + index,
        question: `pregunta ${index}`,
        model: 'sonnet',
        result: { kind: 'general', answer: `respuesta-${index}-${'x'.repeat(7000)}` },
        createdAt: `2026-08-18T09:0${index}`
      }))
      askHistoryRepository = createFakeHistoryRepository({
        getConversation: vi.fn(() => ({ conversation, messages }))
      })
      registerAskHandlers({ askService, askHistoryRepository })

      const result = await invoke('ask:getConversation', { id: 9 })

      const turns: TranscriptSourceTurn[] = messages.map((message) => ({
        messageId: message.id,
        question: message.question,
        result: message.result
      }))
      const expectedWindow = computeTranscriptWindow(turns)

      expect(expectedWindow.excludedCount).toBeGreaterThan(0)
      expect(result).toMatchObject({
        ok: true,
        data: { window: { startMessageId: expectedWindow.startMessageId, excludedCount: expectedWindow.excludedCount } }
      })
    })
  })

  describe('ask:deleteConversation', () => {
    it('rejects a non-positive id with VALIDATION_ERROR without reaching the repository', async () => {
      const result = await invoke('ask:deleteConversation', { id: -1 })

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
      expect(askHistoryRepository.deleteConversation).not.toHaveBeenCalled()
    })

    // Cascade itself is the repository's job (`ON DELETE CASCADE`, design
    // D4) — the handler only needs to forward the id it deleted [AH7,AH8].
    it('deletes and returns the id', async () => {
      askHistoryRepository = createFakeHistoryRepository({ deleteConversation: vi.fn(() => true) })
      registerAskHandlers({ askService, askHistoryRepository })

      const result = await invoke('ask:deleteConversation', { id: 3 })

      expect(result).toEqual({ ok: true, data: { id: 3 } })
      expect(askHistoryRepository.deleteConversation).toHaveBeenCalledWith(3)
    })

    it('returns NOT_FOUND when nothing was deleted', async () => {
      const result = await invoke('ask:deleteConversation', { id: 999 })

      expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    })

    // Same bridge-honesty guarantee as `ask:getConversation` above.
    it('converts an unexpected repository throw into EXECUTION_FAILED rather than throwing', async () => {
      askHistoryRepository = createFakeHistoryRepository({
        deleteConversation: vi.fn(() => {
          throw new Error('disk I/O error')
        })
      })
      registerAskHandlers({ askService, askHistoryRepository })

      const result = await invoke('ask:deleteConversation', { id: 1 })

      expect(result).toMatchObject({ ok: false, error: { code: 'EXECUTION_FAILED', message: 'disk I/O error' } })
    })
  })
})
