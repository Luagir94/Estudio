// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AskResult, ConversationSummary, GetConversationResult } from '../../../shared/ipc/ask'
import type { CliProviderStatus } from '../../../shared/ipc/cli'
import { AskApiError, askApi, cliStatusQueryKey } from './askApi'

const answer: AskResult = {
  kind: 'answer',
  answer: 'Un anillo de división es…',
  citations: [{ kind: 'archivo', subject: 'Álgebra', file: 'apunte-clase-3.pdf' }]
}

const connected: CliProviderStatus = {
  provider: 'claude',
  status: 'connected',
  version: '2.1.29',
  resolvedPath: 'C:\\tools\\claude.cmd',
  source: 'auto',
  overridePath: null,
  detail: null,
  failureReason: null,
  capabilities: { structuredOutput: true, warmSession: true, readOnlyTools: true }
}

describe('askApi', () => {
  beforeEach(() => {
    // @ts-expect-error test-only global stub
    window.api = {
      ask: {
        question: vi.fn(),
        cancel: vi.fn(),
        listConversations: vi.fn(),
        getConversation: vi.fn(),
        deleteConversation: vi.fn()
      },
      cli: { probe: vi.fn(), setOverride: vi.fn(), preferences: vi.fn(), disconnect: vi.fn(), models: vi.fn() }
    }
  })

  describe('question', () => {
    it('parses and returns the full turn response, including its conversationId', async () => {
      // The wire response wraps the result with its conversation id (design
      // D5/D6) — `question()` now surfaces BOTH, because the container
      // branches thread selection off the sentinel (design D6, PR3b).
      vi.mocked(window.api.ask.question).mockResolvedValue({ ok: true, data: { conversationId: 5, result: answer } })

      expect(
        await askApi.question('¿Qué es un anillo de división?', { provider: 'claude', modelId: 'claude-sonnet-5' })
      ).toEqual({
        conversationId: 5,
        result: answer
      })
      expect(window.api.ask.question).toHaveBeenCalledWith({
        question: '¿Qué es un anillo de división?',
        provider: 'claude',
        model: 'claude-sonnet-5'
      })
    })

    it('parses and returns the not-found variant with a null conversationId', async () => {
      vi.mocked(window.api.ask.question).mockResolvedValue({
        ok: true,
        data: { conversationId: null, result: { kind: 'not-found' } }
      })

      expect(await askApi.question('¿Y esto?', { provider: 'claude', modelId: 'claude-sonnet-5' })).toEqual({
        conversationId: null,
        result: { kind: 'not-found' }
      })
    })

    // A continued thread sends its conversationId through to the bridge, so
    // the write hook appends to the SAME conversation rather than starting a
    // new one (design D1).
    it('forwards conversationId when continuing a thread', async () => {
      vi.mocked(window.api.ask.question).mockResolvedValue({ ok: true, data: { conversationId: 5, result: answer } })

      await askApi.question('¿Y esto?', { provider: 'claude', modelId: 'claude-sonnet-5' }, 5)

      expect(window.api.ask.question).toHaveBeenCalledWith({
        question: '¿Y esto?',
        provider: 'claude',
        model: 'claude-sonnet-5',
        conversationId: 5
      })
    })

    // The container maps its copy off the CODE, so the code has to survive
    // the throw — a plain Error would erase it.
    it('throws AskApiError carrying the typed code', async () => {
      vi.mocked(window.api.ask.question).mockResolvedValue({
        ok: false,
        error: { code: 'TIMEOUT', message: 'nothing to read' }
      })

      await expect(
        askApi.question('¿Y esto?', { provider: 'claude', modelId: 'claude-sonnet-5' })
      ).rejects.toBeInstanceOf(AskApiError)
      await expect(
        askApi.question('¿Y esto?', { provider: 'claude', modelId: 'claude-sonnet-5' })
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
        message: 'nothing to read'
      })
    })

    it('falls back to EXECUTION_FAILED when the envelope carries an unknown code', async () => {
      vi.mocked(window.api.ask.question).mockResolvedValue({
        ok: false,
        error: { code: 'SOMETHING_NEW', message: 'drift' }
      })

      await expect(
        askApi.question('¿Y esto?', { provider: 'claude', modelId: 'claude-sonnet-5' })
      ).rejects.toMatchObject({ code: 'EXECUTION_FAILED' })
    })

    // Renderer-side parsing is the second half of the two-sided rule: a
    // drifted payload must fail here rather than render as a citation-less
    // answer.
    it('rejects a payload that does not satisfy the result schema', async () => {
      vi.mocked(window.api.ask.question).mockResolvedValue({
        ok: true,
        data: { conversationId: null, result: { kind: 'answer', answer: 'Sin fuentes.', citations: [] } }
      })

      await expect(askApi.question('¿Y esto?', { provider: 'claude', modelId: 'claude-sonnet-5' })).rejects.toThrow()
    })
  })

  describe('cancel', () => {
    it('resolves when the envelope reports ok', async () => {
      vi.mocked(window.api.ask.cancel).mockResolvedValue({ ok: true, data: undefined })

      await expect(askApi.cancel()).resolves.toBeUndefined()
    })

    // Cancel is fired on unmount, where nothing must be allowed to throw into
    // a teardown path.
    it('stays silent when the envelope reports an error', async () => {
      vi.mocked(window.api.ask.cancel).mockResolvedValue({ ok: false, error: { code: 'X', message: 'y' } })

      await expect(askApi.cancel()).resolves.toBeUndefined()
    })
  })

  describe('probe', () => {
    it('parses the CLI status payload', async () => {
      vi.mocked(window.api.cli.probe).mockResolvedValue({ ok: true, data: connected })

      expect(await askApi.probe('claude')).toEqual(connected)
    })

    // The panel asks about ONE CLI — the one it is about to spend a question
    // on. Probing the other two would spawn processes for answers it discards.
    it('probes only the provider it was given', async () => {
      vi.mocked(window.api.cli.probe).mockResolvedValue({ ok: true, data: { ...connected, provider: 'codex' } })

      await askApi.probe('codex')

      expect(window.api.cli.probe).toHaveBeenCalledWith({ provider: 'codex' })
    })

    // Same key as Ajustes so a CLI connected there is not probed again here.
    it('shares the per-provider status query key with Ajustes', () => {
      expect(cliStatusQueryKey('codex')).toEqual(['cli', 'status', 'codex'])
    })

    // The cli:* codes are foreign to the ask error contract, so they funnel
    // to the generic failure — but through AskApiError, never a plain Error
    // that would erase the code the panel maps its copy from.
    it('throws AskApiError funneling a foreign envelope code to EXECUTION_FAILED', async () => {
      vi.mocked(window.api.cli.probe).mockResolvedValue({
        ok: false,
        error: { code: 'PROBE_FAILED', message: 'spawn blew up' }
      })

      await expect(askApi.probe('claude')).rejects.toBeInstanceOf(AskApiError)
      await expect(askApi.probe('claude')).rejects.toMatchObject({
        code: 'EXECUTION_FAILED',
        message: 'spawn blew up'
      })
    })

    it('preserves a code the ask error contract already knows', async () => {
      vi.mocked(window.api.cli.probe).mockResolvedValue({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'provider.unknown' }
      })

      await expect(askApi.probe('claude')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    })
  })

  describe('preferences', () => {
    it('throws AskApiError funneling a foreign envelope code to EXECUTION_FAILED', async () => {
      vi.mocked(window.api.cli.preferences).mockResolvedValue({
        ok: false,
        error: { code: 'PREFERENCES_READ_FAILED', message: 'settings table locked' }
      })

      await expect(askApi.preferences()).rejects.toBeInstanceOf(AskApiError)
      await expect(askApi.preferences()).rejects.toMatchObject({
        code: 'EXECUTION_FAILED',
        message: 'settings table locked'
      })
    })

    it('preserves a code the ask error contract already knows', async () => {
      vi.mocked(window.api.cli.preferences).mockResolvedValue({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'payload.invalid' }
      })

      await expect(askApi.preferences()).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    })
  })

  describe('listConversations', () => {
    it('parses a valid conversation summary list', async () => {
      const summaries: ConversationSummary[] = [
        { id: 2, title: 'Segunda', createdAt: '2026-08-18T09:05', updatedAt: '2026-08-18T09:10' },
        { id: 1, title: 'Primera', createdAt: '2026-08-18T09:00', updatedAt: '2026-08-18T09:00' }
      ]
      vi.mocked(window.api.ask.listConversations).mockResolvedValue({ ok: true, data: summaries })

      expect(await askApi.listConversations()).toEqual(summaries)
    })

    // Renderer-side parsing is the second half of the two-sided rule: a
    // drifted payload must fail here rather than reach the browse list.
    it('rejects a payload that does not satisfy the summary schema', async () => {
      vi.mocked(window.api.ask.listConversations).mockResolvedValue({
        ok: true,
        // Non-positive id — drifted shape.
        data: [{ id: 0, title: 'Primera', createdAt: '2026-08-18T09:00', updatedAt: '2026-08-18T09:00' }]
      })

      await expect(askApi.listConversations()).rejects.toThrow()
    })
  })

  describe('getConversation', () => {
    it('parses a valid conversation with its messages and boundary marker', async () => {
      const data: GetConversationResult = {
        conversation: {
          id: 1,
          title: '¿Qué es un anillo?',
          createdAt: '2026-08-18T09:00',
          updatedAt: '2026-08-18T09:00'
        },
        messages: [
          {
            id: 1000,
            question: '¿Qué es un anillo?',
            model: 'sonnet',
            result: { kind: 'not-found' },
            createdAt: '2026-08-18T09:00'
          }
        ],
        window: { startMessageId: 1000, excludedCount: 0 }
      }
      vi.mocked(window.api.ask.getConversation).mockResolvedValue({ ok: true, data })

      expect(await askApi.getConversation(1)).toEqual(data)
      expect(window.api.ask.getConversation).toHaveBeenCalledWith({ id: 1 })
    })

    it('rejects a payload that does not satisfy the conversation schema', async () => {
      vi.mocked(window.api.ask.getConversation).mockResolvedValue({
        ok: true,
        data: {
          conversation: { id: 1, title: 'x', createdAt: 'x', updatedAt: 'x' },
          messages: [],
          // Negative excludedCount — drifted shape.
          window: { startMessageId: null, excludedCount: -1 }
        }
      })

      await expect(askApi.getConversation(1)).rejects.toThrow()
    })
  })

  describe('deleteConversation', () => {
    it('parses a valid delete result', async () => {
      vi.mocked(window.api.ask.deleteConversation).mockResolvedValue({ ok: true, data: { id: 3 } })

      expect(await askApi.deleteConversation(3)).toEqual({ id: 3 })
      expect(window.api.ask.deleteConversation).toHaveBeenCalledWith({ id: 3 })
    })

    it('rejects a payload that does not satisfy the delete result schema', async () => {
      vi.mocked(window.api.ask.deleteConversation).mockResolvedValue({
        ok: true,
        // Non-positive id — drifted shape.
        data: { id: -1 }
      })

      await expect(askApi.deleteConversation(3)).rejects.toThrow()
    })
  })
})
