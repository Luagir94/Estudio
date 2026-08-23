// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AskResult, ConversationSummary, GetConversationResult } from '../../../shared/ipc/ask'
import { CLI_PROVIDERS, type CliPreference, type CliProvider, type CliProviderStatus } from '../../../shared/ipc/cli'
import { AskApiError, askApi } from '../adapters/askApi'
import {
  ASK_BASELINE_MODELS,
  ASK_COMPOSER_PLACEHOLDER_BROWSING,
  ASK_COMPOSER_PLACEHOLDER_DEGRADED,
  ASK_NO_CLI_CONNECTED
} from '../domain/askDisplay'
import { AskPanelContainer } from './AskPanelContainer'

vi.mock('../adapters/askApi', async () => {
  const actual = await vi.importActual<typeof import('../adapters/askApi')>('../adapters/askApi')
  return {
    ...actual,
    askApi: {
      question: vi.fn(),
      cancel: vi.fn(),
      probe: vi.fn(),
      preferences: vi.fn(),
      models: vi.fn(),
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      deleteConversation: vi.fn()
    }
  }
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// The panel probes ONLY the provider it is asking with, so the fixture is a
// single status rather than a list of three.
function status(overrides: Partial<CliProviderStatus> = {}): CliProviderStatus {
  return {
    provider: 'claude',
    status: 'connected',
    version: '2.1.29',
    resolvedPath: 'C:\\tools\\claude.cmd',
    source: 'auto',
    overridePath: null,
    detail: null,
    capabilities: { structuredOutput: true, warmSession: true, readOnlyTools: true },
    ...overrides
  }
}

/** The persisted preferences the panel reads: permission plus a saved path it never edits. */
function prefs(connected: readonly CliProvider[]): CliPreference[] {
  return CLI_PROVIDERS.map((provider) => ({
    provider,
    connected: connected.includes(provider),
    overridePath: null,
    // Connected AND working: the panel offers models only for CLIs it has seen
    // answer, so these fixtures have to say so.
    lastStatus: connected.includes(provider) ? ('connected' as const) : null
  }))
}

function summary(overrides: Partial<ConversationSummary> & { id: number }): ConversationSummary {
  return {
    title: `Hilo ${overrides.id}`,
    createdAt: '2026-08-18T09:00',
    updatedAt: '2026-08-18T09:00',
    ...overrides
  }
}

function conversation(
  id: number,
  messages: GetConversationResult['messages'],
  window: GetConversationResult['window'] = { startMessageId: messages[0]?.id ?? null, excludedCount: 0 }
): GetConversationResult {
  return { conversation: summary({ id }), messages, window }
}

function message(
  id: number,
  question: string,
  result: AskResult,
  createdAt = '2026-08-18T09:00'
): GetConversationResult['messages'][number] {
  return { id, question, model: 'sonnet', result, createdAt }
}

/** Not persisted: the container's simplest local-only path. */
function notSaved(result: AskResult): { conversationId: null; result: AskResult } {
  return { conversationId: null, result }
}

function renderPanel(onGoToAjustes = vi.fn()) {
  const view = render(<AskPanelContainer onGoToAjustes={onGoToAjustes} />, { wrapper })
  return { ...view, onGoToAjustes }
}

async function openPanel(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /preguntar sobre mi cursada/i }))
  await screen.findByRole('dialog')
}

async function ask(text: string): Promise<void> {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } })
  fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLFormElement)
}

/**
 * The baseline every block starts from: a clean slate, a healthy CLI, and every
 * provider connected. Shared as a function rather than a nested `beforeEach` so
 * the describes below the parent get the same footing — a block that only
 * overrode `connected` would still be counting calls left by earlier tests.
 */
function resetAskMocks(): void {
  vi.clearAllMocks()
  window.localStorage.clear()
  vi.mocked(askApi.probe).mockResolvedValue(status())
  // Every CLI connected is the default: most cases are about the panel, and the
  // permission gate has its own describe blocks.
  vi.mocked(askApi.preferences).mockResolvedValue(prefs(CLI_PROVIDERS))
  vi.mocked(askApi.cancel).mockResolvedValue(undefined)
  // Nothing discovered is the DEFAULT, so every other test proves the panel
  // works on the curated list alone.
  vi.mocked(askApi.models).mockResolvedValue([])
  // First-ever-run default: no conversations exist yet.
  vi.mocked(askApi.listConversations).mockResolvedValue([])
}

describe('AskPanelContainer', () => {
  beforeEach(resetAskMocks)

  it('starts closed, showing only the trigger', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: /preguntar sobre mi cursada/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // The approved design keeps the trigger on screen next to the open panel
  // (node `p5nQEV` alongside `cPjc5`), so it doubles as the close affordance.
  it('keeps the trigger visible while open and toggles the panel closed', async () => {
    renderPanel()
    const trigger = screen.getByRole('button', { name: /preguntar sobre mi cursada/i })
    await openPanel()

    expect(trigger).toBeVisible()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(trigger)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  describe('keyboard', () => {
    function type(text: string): HTMLElement {
      const box = screen.getByRole('textbox')
      fireEvent.change(box, { target: { value: text } })
      return box
    }

    /**
     * `mutation.mutate` does not reach the mutation function synchronously, so
     * a bare `not.toHaveBeenCalled()` right after a keypress passes whether the
     * handler is wired or not. Every assertion below runs after this flush, so
     * the negative cases actually test something.
     */
    const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

    it('sends on Enter', async () => {
      vi.mocked(askApi.question).mockResolvedValue(notSaved({ kind: 'not-found' }))
      renderPanel()
      await openPanel()

      fireEvent.keyDown(type('¿Y esto?'), { key: 'Enter' })
      await flush()

      expect(askApi.question).toHaveBeenCalledWith('¿Y esto?', { provider: 'claude', modelId: 'claude-sonnet-5' })
    })

    it('does NOT send on Alt+Enter, leaving the newline to the textarea', async () => {
      renderPanel()
      await openPanel()

      fireEvent.keyDown(type('primera línea'), { key: 'Enter', altKey: true })
      await flush()

      expect(askApi.question).not.toHaveBeenCalled()
    })

    // Spanish is typed with dead keys, so Enter can arrive while an accent is
    // still being resolved. Submitting there would send a half-typed question.
    it('does NOT send while an IME composition is in progress', async () => {
      renderPanel()
      await openPanel()

      fireEvent.keyDown(type('¿Qué es un anillo'), { key: 'Enter', isComposing: true })
      await flush()

      expect(askApi.question).not.toHaveBeenCalled()
    })

    it('ignores Enter on an empty draft', async () => {
      renderPanel()
      await openPanel()

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      await flush()

      expect(askApi.question).not.toHaveBeenCalled()
    })

    it('ignores Enter while the CLI is degraded', async () => {
      vi.mocked(askApi.probe).mockResolvedValue(status({ status: 'not-found' }))
      renderPanel()
      await openPanel()
      await screen.findByText('No encontramos ese CLI')

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      await flush()

      expect(askApi.question).not.toHaveBeenCalled()
    })
  })

  describe('model choice', () => {
    it('sends the selected model with the question and remembers it', async () => {
      vi.mocked(askApi.question).mockResolvedValue(notSaved({ kind: 'not-found' }))
      renderPanel()
      await openPanel()

      fireEvent.click(await screen.findByRole('button', { name: /sonnet 5/i }))
      fireEvent.click(screen.getByRole('option', { name: /opus 5/i }))
      await ask('¿Y esto?')

      expect(askApi.question).toHaveBeenCalledWith('¿Y esto?', { provider: 'claude', modelId: 'claude-opus-5' })
      expect(window.localStorage.getItem('ask:selection')).toBe(
        JSON.stringify({ provider: 'claude', modelId: 'claude-opus-5' })
      )
    })

    it('restores the stored model on the next mount', async () => {
      window.localStorage.setItem(
        'ask:selection',
        JSON.stringify({ provider: 'claude', modelId: 'claude-haiku-4-5-20251001' })
      )
      vi.mocked(askApi.question).mockResolvedValue(notSaved({ kind: 'not-found' }))
      renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      expect(askApi.question).toHaveBeenCalledWith('¿Y esto?', {
        provider: 'claude',
        modelId: 'claude-haiku-4-5-20251001'
      })
    })

    // A stored value from an older build, or one hand-edited into a shape the
    // spawn boundary would refuse, must not be sent: it would fail at spawn
    // time instead of here.
    it('falls back to the default when storage holds an unusable selection', async () => {
      window.localStorage.setItem('ask:selection', JSON.stringify({ provider: 'claude', modelId: 'claude sonnet' }))
      vi.mocked(askApi.question).mockResolvedValue(notSaved({ kind: 'not-found' }))
      renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      expect(askApi.question).toHaveBeenCalledWith('¿Y esto?', { provider: 'claude', modelId: 'claude-sonnet-5' })
    })

    // The picker offers what the INSTALLED CLI turned out to have, not only
    // what this app was written knowing. `claude-fable-5[1m]` is not in the
    // curated list and could not be: it did not exist when that list was
    // written, and the bracketed context-window suffix is exactly the shape
    // the shared gate used to refuse.
    it('offers a model discovered in the installed CLI and asks with it', async () => {
      vi.mocked(askApi.models).mockResolvedValue([
        { provider: 'claude', modelId: 'claude-fable-5[1m]', origin: 'catalog', rank: null }
      ])
      vi.mocked(askApi.question).mockResolvedValue(notSaved({ kind: 'not-found' }))
      renderPanel()
      await openPanel()

      fireEvent.click(await screen.findByRole('button', { name: /sonnet 5/i }))
      fireEvent.click(await screen.findByRole('option', { name: /fable 5 · 1M/i }))
      await ask('¿Y esto?')

      expect(askApi.question).toHaveBeenCalledWith('¿Y esto?', {
        provider: 'claude',
        modelId: 'claude-fable-5[1m]'
      })
    })

    // Discovery is ADDITIVE. A CLI that reports nothing must leave the panel
    // exactly where it stood before this feature existed.
    it('keeps the curated models when nothing was discovered', async () => {
      renderPanel()
      await openPanel()

      fireEvent.click(await screen.findByRole('button', { name: /sonnet 5/i }))

      // Scoped to the model list: the provider dropdown below it renders
      // options of its own, and counting those would prove nothing. Counted
      // against the baseline itself rather than a literal, so the assertion
      // keeps meaning "exactly the curated set, nothing more" as that set grows.
      expect(within(screen.getByRole('listbox', { name: 'Modelo' })).getAllByRole('option')).toHaveLength(
        ASK_BASELINE_MODELS.length
      )
    })

    // Nine models across two CLIs is a list nobody scans flat. The heading
    // carries the provenance so the rows do not have to repeat it — and it is
    // the app's own word for the CLI, never a label read out of its state file.
    it('groups the options under the CLI each one belongs to', async () => {
      vi.mocked(askApi.models).mockResolvedValue([
        { provider: 'codex', modelId: 'gpt-5.6-terra', origin: 'catalog', rank: null }
      ])
      renderPanel()
      await openPanel()

      fireEvent.click(await screen.findByRole('button', { name: /sonnet 5/i }))

      expect(await screen.findByRole('group', { name: 'Codex CLI' })).toBeInTheDocument()
      expect(
        within(screen.getByRole('group', { name: 'Codex CLI' })).getByRole('option', { name: /GPT 5.6 Terra/ })
      ).toBeInTheDocument()
    })

    // A CLI the student does not have must not leave an empty heading behind.
    it('shows no heading for a CLI with nothing to offer', async () => {
      renderPanel()
      await openPanel()

      fireEvent.click(await screen.findByRole('button', { name: /sonnet 5/i }))

      expect(screen.queryByRole('group', { name: 'Codex CLI' })).not.toBeInTheDocument()
    })

    // The recommendation is a claim about a choice that can be made RIGHT NOW,
    // so it is resolved against what the picker actually offers.
    it('marks exactly one available model as recommended', async () => {
      vi.mocked(askApi.models).mockResolvedValue([
        { provider: 'codex', modelId: 'gpt-5.6-terra', origin: 'catalog', rank: null }
      ])
      renderPanel()
      await openPanel()

      fireEvent.click(await screen.findByRole('button', { name: /sonnet 5/i }))

      const badges = await screen.findAllByText('Recomendado')
      expect(badges).toHaveLength(1)
      expect(screen.getByRole('option', { name: /Sonnet 5/ })).toHaveTextContent('Recomendado')
    })

    // The field that let a student type an id is gone: discovery replaced the
    // guess it existed for, and a typed id failed at spawn time, far from
    // where it was typed.
    it('offers no way to type a model id by hand', async () => {
      renderPanel()
      await openPanel()

      fireEvent.click(await screen.findByRole('button', { name: /sonnet 5/i }))

      expect(screen.queryByRole('textbox', { name: /otro modelo/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Usar' })).not.toBeInTheDocument()
    })

    // The list grows with whatever the CLIs report, so the menu's height has
    // to be a property of the menu — this bound is what stopped it pushing
    // past the panel with no way to reach the rows below.
    it('keeps the list bounded and scrollable however many models exist', async () => {
      vi.mocked(askApi.models).mockResolvedValue(
        Array.from({ length: 20 }, (_, index) => ({
          provider: 'codex' as const,
          modelId: `gpt-5.${index}`,
          origin: 'catalog' as const,
          rank: null
        }))
      )
      renderPanel()
      await openPanel()

      fireEvent.click(await screen.findByRole('button', { name: /sonnet 5/i }))

      const list = await screen.findByRole('listbox', { name: 'Modelo' })
      expect(list.className).toContain('overflow-y-auto')
      expect(list.className).toContain('max-h-[360px]')
    })

    it('disables the picker when the CLI is degraded', async () => {
      vi.mocked(askApi.probe).mockResolvedValue(status({ status: 'not-found' }))
      renderPanel()
      await openPanel()

      // Waits for the DEGRADED state itself, not merely for the picker to have
      // a name: the permission read and the probe settle independently, and
      // asserting between the two would be asserting on a half-loaded panel.
      await screen.findByText('No encontramos ese CLI')

      expect(screen.getByRole('button', { name: /sonnet 5/i })).toBeDisabled()
    })
  })

  describe('waiting state', () => {
    /** A question that never settles, so the pending state stays on screen. */
    function askAndHang(): void {
      vi.mocked(askApi.question).mockReturnValue(new Promise(() => {}))
    }

    it('spins the icon while the question is in flight', async () => {
      askAndHang()
      const { container } = renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      expect(await screen.findByText('Buscando en tu cursada…')).toBeInTheDocument()
      expect(container.querySelector('.animate-spin')).not.toBeNull()
    })

    // A spinner nobody can see is not a loading state. `role="status"` is what
    // makes the wait perceivable to a screen reader.
    it('announces the wait as a live status', async () => {
      askAndHang()
      renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      expect(await screen.findByRole('status')).toHaveTextContent('Buscando en tu cursada…')
    })

    it('stops spinning once the answer arrives', async () => {
      vi.mocked(askApi.question).mockResolvedValue(notSaved({ kind: 'general', answer: 'Listo.' }))
      const { container } = renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      await screen.findByText('Listo.')
      expect(container.querySelector('.animate-spin')).toBeNull()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    // The send arrow MORPHS into a stop control while the question is in
    // flight (design `Screen — Preguntar · Estados`, cell PENSANDO): same
    // spot, opposite job. Enabled on purpose — canceling is the one action
    // that only makes sense while everything else in the composer is locked.
    it('swaps the send button for an enabled cancel control while the question is in flight', async () => {
      askAndHang()
      renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      expect(await screen.findByRole('button', { name: 'Cancelar' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
    })

    it('cancels the in-flight question when the stop control is clicked', async () => {
      askAndHang()
      renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

      await waitFor(() => expect(askApi.cancel).toHaveBeenCalledTimes(1))
    })

    it('returns the send button once the answer arrives', async () => {
      vi.mocked(askApi.question).mockResolvedValue(notSaved({ kind: 'general', answer: 'Listo.' }))
      renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      await screen.findByText('Listo.')
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    })
  })

  it('always shows the cost disclaimer while open', async () => {
    renderPanel()
    await openPanel()

    expect(screen.getByText('Esta función usa tu propio uso de Claude')).toBeInTheDocument()
  })

  describe('degraded CLI', () => {
    it('offers the Ajustes route and refuses to send when the CLI is missing', async () => {
      vi.mocked(askApi.probe).mockResolvedValue(status({ status: 'not-found' }))
      const { onGoToAjustes } = renderPanel()
      await openPanel()

      expect(await screen.findByText('No encontramos ese CLI')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: /ir a ajustes/i }))
      expect(onGoToAjustes).toHaveBeenCalledTimes(1)
      expect(askApi.question).not.toHaveBeenCalled()
    })

    it('treats an unusable CLI as degraded too', async () => {
      vi.mocked(askApi.probe).mockResolvedValue(status({ status: 'unusable' }))
      renderPanel()
      await openPanel()

      expect(await screen.findByText('El CLI configurado no se puede usar')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toBeDisabled()
    })
  })

  describe('answers', () => {
    it('renders the answer with its citations', async () => {
      vi.mocked(askApi.question).mockResolvedValue(
        notSaved({
          kind: 'answer',
          answer: 'Está en la clase 3.',
          citations: [{ kind: 'archivo', subject: 'Álgebra', file: 'apunte-clase-3.pdf' }]
        })
      )
      renderPanel()
      await openPanel()
      await ask('¿Dónde está la fórmula?')

      expect(await screen.findByText('Está en la clase 3.')).toBeInTheDocument()
      expect(screen.getByText('Álgebra · apunte-clase-3.pdf')).toBeInTheDocument()
      expect(screen.getByText('FUENTES')).toBeInTheDocument()
    })

    // Attachments are third-party documents, so the answer is UNTRUSTED data.
    // It must reach the screen as text, never as markup the renderer executes.
    it('renders a hostile answer literally instead of as markup', async () => {
      const hostile = '<img src=x onerror="alert(1)"> [click](javascript:alert(2)) **bold**'
      vi.mocked(askApi.question).mockResolvedValue(
        notSaved({
          kind: 'answer',
          answer: hostile,
          citations: [{ kind: 'archivo', subject: 'Álgebra', file: 'a.pdf' }]
        })
      )
      const { container } = renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      expect(await screen.findByText(hostile)).toBeInTheDocument()
      expect(container.querySelector('img')).toBeNull()
      expect(container.querySelector('a')).toBeNull()
    })

    it('renders the app\u2019s own words for the not-found outcome, never model text', async () => {
      vi.mocked(askApi.question).mockResolvedValue(notSaved({ kind: 'not-found' }))
      renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      expect(await screen.findByText('No encontré eso en tu cursada.')).toBeInTheDocument()
    })

    it('maps a typed error code to its Spanish copy', async () => {
      vi.mocked(askApi.question).mockRejectedValue(new AskApiError('TIMEOUT', 'nothing'))
      renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      expect(await screen.findByText('La consulta tardó demasiado')).toBeInTheDocument()
    })

    // With an empty app the model answers anyway, and the marker is the ONLY
    // thing telling the student this did not come from their own material.
    it('marks a general answer as not coming from the student’s data', async () => {
      vi.mocked(askApi.question).mockResolvedValue(notSaved({ kind: 'general', answer: 'José Hernández, en 1872.' }))
      renderPanel()
      await openPanel()
      await ask('¿Quién escribió el Martín Fierro?')

      expect(await screen.findByText('José Hernández, en 1872.')).toBeInTheDocument()
      expect(screen.getByText('Respuesta general · no salió de tus datos')).toBeInTheDocument()
      expect(screen.queryByText('FUENTES')).not.toBeInTheDocument()
    })

    it('renders a data citation with its section, not just file citations', async () => {
      vi.mocked(askApi.question).mockResolvedValue(
        notSaved({
          kind: 'answer',
          answer: 'El lunes tenés Derecho Romano a las 08:00.',
          citations: [{ kind: 'dato', section: 'horario', label: 'Derecho Romano' }]
        })
      )
      renderPanel()
      await openPanel()
      await ask('¿Qué tengo el lunes?')

      expect(await screen.findByText('Horario · Derecho Romano')).toBeInTheDocument()
      expect(screen.getByText('FUENTES')).toBeInTheDocument()
    })

    it('names the offending files when the size gate rejects', async () => {
      vi.mocked(askApi.question).mockRejectedValue(new AskApiError('OVERSIZED_ATTACHMENT', 'enorme.pdf'))
      renderPanel()
      await openPanel()
      await ask('¿Y esto?')

      expect(await screen.findByText(/enorme\.pdf/)).toBeInTheDocument()
    })
  })

  // Design D6 (rev 2), root-cause fix for validator #255: a failed write must
  // read as "the answer is real but unsaved", never as a silent thread
  // switch or a swallowed answer.
  describe('write-failure honesty (conversationId: null)', () => {
    it('renders the answer plus a visible not-saved marker, leaving selection, thread and queries untouched', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([summary({ id: 9, updatedAt: '2026-08-18T10:00' })])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(9, [message(1, '¿Qué es un anillo?', { kind: 'not-found' })])
      )
      renderPanel()
      await openPanel()
      await screen.findByText('¿Qué es un anillo?')
      vi.mocked(askApi.getConversation).mockClear()
      vi.mocked(askApi.listConversations).mockClear()
      vi.mocked(askApi.question).mockResolvedValue(
        notSaved({
          kind: 'answer',
          answer: 'No se guardó.',
          citations: [{ kind: 'archivo', subject: 'Álgebra', file: 'a.pdf' }]
        })
      )

      await ask('¿Otra?')

      expect(await screen.findByText('No se guardó.')).toBeInTheDocument()
      expect(screen.getByText('Esta respuesta no se guardó en el historial')).toBeInTheDocument()
      // The resumed thread's earlier turn is still on screen — selection never moved.
      expect(screen.getByText('¿Qué es un anillo?')).toBeInTheDocument()
      expect(askApi.getConversation).not.toHaveBeenCalled()
      expect(askApi.listConversations).not.toHaveBeenCalled()
    })
  })

  describe('thread resume and first-ever run', () => {
    // Also proves write success: a persisted turn switches selection to the
    // new thread and refetches both queries (design D6).
    it('switches to and resumes the new thread after a persisted write', async () => {
      vi.mocked(askApi.question).mockResolvedValue({ conversationId: 4, result: { kind: 'not-found' } })
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(4, [message(1, '¿Y esto?', { kind: 'not-found' })])
      )
      renderPanel()
      await openPanel()

      await ask('¿Y esto?')

      expect(askApi.question).toHaveBeenCalledWith('¿Y esto?', { provider: 'claude', modelId: 'claude-sonnet-5' }) // a brand-new thread sends no id
      await waitFor(() => expect(askApi.getConversation).toHaveBeenCalledWith(4))
      expect(await screen.findByText('¿Y esto?')).toBeInTheDocument()
    })

    it('resumes the most recently updated conversation on open; first-ever run (no conversations) shows blank', async () => {
      renderPanel()
      await openPanel()
      expect(await screen.findByText('Preguntá sobre tu cursada')).toBeInTheDocument()
      expect(askApi.getConversation).not.toHaveBeenCalled()

      vi.mocked(askApi.listConversations).mockResolvedValue([
        summary({ id: 9, title: 'Más reciente', updatedAt: '2026-08-18T10:00' }),
        summary({ id: 3, title: 'Vieja', updatedAt: '2026-08-17T09:00' })
      ])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(9, [message(1, '¿Qué es un anillo?', { kind: 'not-found' })])
      )
      fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
      await openPanel()

      expect(await screen.findByText('¿Qué es un anillo?')).toBeInTheDocument()
      expect(askApi.getConversation).toHaveBeenCalledWith(9)
    })

    // Resume has no memory of a specific target id — recomputed from
    // whatever the live list currently contains, so a deleted target simply
    // cannot be selected; the next most recent takes its place.
    it('falls back to the next most recent conversation when the resumed one is gone', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([summary({ id: 3, title: 'Siguiente más reciente' })])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(3, [message(5, '¿Y esto otro?', { kind: 'not-found' })])
      )
      renderPanel()
      await openPanel()

      expect(await screen.findByText('¿Y esto otro?')).toBeInTheDocument()
      expect(askApi.getConversation).toHaveBeenCalledWith(3)
    })

    // Temporal replay: a previously-persisted hostile answer must render
    // exactly as literally as a live one does.
    it('renders a persisted hostile answer literally on reopen, never as markup', async () => {
      const hostile = '<img src=x onerror="alert(1)"> [click](javascript:alert(2)) **bold**'
      vi.mocked(askApi.listConversations).mockResolvedValue([summary({ id: 1, title: 'Hostil' })])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(1, [
          message(1, '¿Y esto?', {
            kind: 'answer',
            answer: hostile,
            citations: [{ kind: 'archivo', subject: 'Álgebra', file: 'a.pdf' }]
          })
        ])
      )
      const { container } = renderPanel()
      await openPanel()

      expect(await screen.findByText(hostile)).toBeInTheDocument()
      expect(container.querySelector('img')).toBeNull()
      expect(container.querySelector('a')).toBeNull()
    })
  })

  // Design D6: "New-thread affordance = setSelection({kind:'new'}) (no IPC)".
  // Its UI trigger is PR4's job (pen-gated, no browse list to attach a
  // button to yet); the state transition it will call is proven directly in
  // `threadSelection.test.ts` — `new` always resolves to null, regardless of
  // what the conversation list contains, so it can never silently pick up
  // the latest thread.

  describe('closing and reopening', () => {
    it('discards a not-saved turn when the panel is closed and reopened', async () => {
      vi.mocked(askApi.question).mockResolvedValue(
        notSaved({
          kind: 'answer',
          answer: 'Está en la clase 3.',
          citations: [{ kind: 'archivo', subject: 'Álgebra', file: 'a.pdf' }]
        })
      )
      renderPanel()
      await openPanel()
      await ask('¿Dónde está la fórmula?')
      await screen.findByText('Está en la clase 3.')

      fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
      await openPanel()

      expect(screen.queryByText('Está en la clase 3.')).not.toBeInTheDocument()
    })

    // The whole point of persistence: a SAVED turn survives the panel
    // closing, because it lives in the resumed conversation query, not
    // local-only state — the SAME resume path "thread resume" above already
    // proves, since `selection`/the query cache both outlive a close (the
    // container never unmounts, only `open` toggles).

    it('cancels any in-flight question when it closes', async () => {
      renderPanel()
      await openPanel()

      fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))

      await waitFor(() => expect(askApi.cancel).toHaveBeenCalled())
    })

    it('cancels on unmount, so a question never outlives the panel', async () => {
      const { unmount } = renderPanel()
      await openPanel()

      unmount()

      await waitFor(() => expect(askApi.cancel).toHaveBeenCalled())
    })
  })

  // History browsing (design #268 §3, entry affordance #273 §1): a dedicated
  // History button in the Panel Actions row toggles the browse list. It
  // replaces the #269 stopgap, which made the panel TITLE the click target
  // because no affordance had been drawn yet.
  describe('history browsing', () => {
    function openHistory(): void {
      fireEvent.click(screen.getByRole('button', { name: /ver conversaciones anteriores/i }))
    }

    // Browsing is a MODE, not an overlay on top of a live thread: while the
    // list is up, no conversation is on screen and the composer has no
    // target. Left enabled it is not merely wrong-looking — the question
    // lands in whatever thread was active BEHIND the list, which is exactly
    // the thread the user is in the middle of navigating away from.
    it('makes the composer inert while the browse list is open, and live again on the way out', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([summary({ id: 9, updatedAt: '2026-08-18T10:00' })])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(9, [message(1, '¿Qué es un anillo?', { kind: 'not-found' })])
      )
      renderPanel()
      await openPanel()
      await screen.findByText('¿Qué es un anillo?')

      openHistory()

      expect(screen.getByRole('textbox')).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()

      openHistory()

      expect(screen.getByRole('textbox')).toBeEnabled()
    })

    // A disabled composer that says nothing reads as broken. It must say why
    // it is inert — and NOT borrow the degraded-CLI copy, which would send a
    // user with a perfectly healthy CLI to Ajustes to fix nothing.
    it('explains the inert composer without borrowing the degraded-CLI copy', async () => {
      renderPanel()
      await openPanel()

      openHistory()

      const placeholder = screen.getByRole('textbox').getAttribute('placeholder')
      expect(placeholder).toBe(ASK_COMPOSER_PLACEHOLDER_BROWSING)
      expect(placeholder).not.toBe(ASK_COMPOSER_PLACEHOLDER_DEGRADED)
    })

    // The guard belongs to the container too, not only to the rendered
    // `disabled`. The discriminator is the DRAFT: `handleSubmit` clears it on
    // the way to a send, so a draft still sitting in the composer after a
    // submit fired with the list open is proof that nothing was sent — and
    // proof no waiting could fake, unlike a call count that a guarded and an
    // unguarded run both eventually reach.
    it('holds a typed draft while browsing and sends it only once the list is closed', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([summary({ id: 9, updatedAt: '2026-08-18T10:00' })])
      vi.mocked(askApi.getConversation).mockResolvedValue(conversation(9, []))
      vi.mocked(askApi.question).mockResolvedValue({ conversationId: 9, result: { kind: 'not-found' } })
      renderPanel()
      await openPanel()
      const form = (): HTMLFormElement => screen.getByRole('textbox').closest('form') as HTMLFormElement
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '¿Cuándo entrego el TP?' } })

      openHistory()
      fireEvent.submit(form())
      openHistory()

      expect(screen.getByRole('textbox')).toHaveValue('¿Cuándo entrego el TP?')

      fireEvent.submit(form())

      await waitFor(() => expect(askApi.question).toHaveBeenCalledTimes(1))
      expect(askApi.question).toHaveBeenCalledWith(
        '¿Cuándo entrego el TP?',
        { provider: 'claude', modelId: 'claude-sonnet-5' },
        9
      )
    })

    it('renders conversations ordered by recency with exactly one selected', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([
        summary({ id: 9, title: 'Más reciente', updatedAt: '2026-08-18T10:00' }),
        summary({ id: 3, title: 'Vieja', updatedAt: '2026-08-17T09:00' })
      ])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(9, [message(1, '¿Qué es un anillo?', { kind: 'not-found' })])
      )
      const { container } = renderPanel()
      await openPanel()
      await screen.findByText('¿Qué es un anillo?')

      openHistory()

      const rows = await screen.findAllByText(/Más reciente|Vieja/)
      expect(rows[0]).toHaveTextContent('Más reciente')
      expect(rows[1]).toHaveTextContent('Vieja')
      const selected = container.querySelectorAll('[data-selected="true"]')
      expect(selected).toHaveLength(1)
      expect(selected[0]).toHaveTextContent('Más reciente')
    })

    // Design D6: `setSelection({ kind: 'new' })` was already fully tested at
    // the domain level (`threadSelection.test.ts`) but had no UI trigger —
    // this closes the reachability gap, not the underlying semantics.
    it('wires the new-conversation trigger to a blank thread whose next ask omits conversationId', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([summary({ id: 9, updatedAt: '2026-08-18T10:00' })])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(9, [message(1, '¿Qué es un anillo?', { kind: 'not-found' })])
      )
      vi.mocked(askApi.question).mockResolvedValue(notSaved({ kind: 'not-found' }))
      renderPanel()
      await openPanel()
      await screen.findByText('¿Qué es un anillo?')

      openHistory()
      fireEvent.click(screen.getByText('+ Conversación nueva'))

      expect(screen.queryByText('¿Qué es un anillo?')).not.toBeInTheDocument()
      expect(await screen.findByText('Preguntá sobre tu cursada')).toBeInTheDocument()

      await ask('¿Y esto?')

      expect(askApi.question).toHaveBeenCalledWith('¿Y esto?', { provider: 'claude', modelId: 'claude-sonnet-5' }) // no conversationId
    })

    // Explicitly selects thread 3 (NOT the resume target — 9 is the latest),
    // then deletes exactly that viewed thread: `selectionAfterDelete` must
    // reset selection to `resume`, or the panel would keep pointing a
    // `{kind:'thread', id:3}` reference at a conversation that no longer
    // exists instead of falling back to 9.
    it('deletes the currently-viewed thread, invalidates the list, and resets selection to resume', async () => {
      vi.mocked(askApi.listConversations)
        .mockResolvedValueOnce([
          summary({ id: 9, title: 'Nueve', updatedAt: '2026-08-18T10:00' }),
          summary({ id: 3, title: 'Tres', updatedAt: '2026-08-17T09:00' })
        ])
        .mockResolvedValueOnce([summary({ id: 9, title: 'Nueve', updatedAt: '2026-08-18T10:00' })])
      vi.mocked(askApi.getConversation).mockImplementation(async (id: number) =>
        id === 9
          ? conversation(9, [message(1, 'Pregunta nueve', { kind: 'not-found' })])
          : conversation(3, [message(2, 'Pregunta tres', { kind: 'not-found' })])
      )
      vi.mocked(askApi.deleteConversation).mockResolvedValue({ id: 3 })
      renderPanel()
      await openPanel()
      await screen.findByText('Pregunta nueve') // resumes 9, the latest

      openHistory()
      fireEvent.click(screen.getByText('Tres')) // explicitly view thread 3 instead
      await screen.findByText('Pregunta tres')

      openHistory()
      fireEvent.click(screen.getByRole('button', { name: /eliminar.*tres/i }))

      await waitFor(() => expect(askApi.deleteConversation).toHaveBeenCalledWith(3))
      // Selection resets to `resume`, which falls back to 9 — never a
      // dangling reference to the just-deleted thread 3.
      await waitFor(() => expect(askApi.getConversation).toHaveBeenCalledWith(9))

      openHistory() // close browsing, back to the transcript slot
      expect(await screen.findByText('Pregunta nueve')).toBeInTheDocument()
      expect(screen.queryByText('Pregunta tres')).not.toBeInTheDocument()
    })

    it('does not select the row when only its delete button is clicked', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([
        summary({ id: 9, title: 'Actual', updatedAt: '2026-08-18T10:00' }),
        summary({ id: 3, title: 'Otra', updatedAt: '2026-08-17T09:00' })
      ])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(9, [message(1, '¿Qué es un anillo?', { kind: 'not-found' })])
      )
      vi.mocked(askApi.deleteConversation).mockResolvedValue({ id: 3 })
      renderPanel()
      await openPanel()
      await screen.findByText('¿Qué es un anillo?')

      openHistory()
      const otraDelete = screen.getByRole('button', { name: /eliminar.*otra/i })
      fireEvent.click(otraDelete)

      await waitFor(() => expect(askApi.deleteConversation).toHaveBeenCalledWith(3))
      // getConversation was never re-invoked for id 3 — the row click handler never fired.
      expect(askApi.getConversation).not.toHaveBeenCalledWith(3)
    })
  })

  // The drawn entry affordance (design #273 §1): a `Panel Actions` row on the
  // right of the Panel Head holding the History control and the existing
  // Close. This is what actually closes the #269 design gap — the browse
  // surface finally has a visible way in.
  describe('history entry affordance', () => {
    function historyButton(): HTMLElement {
      return screen.getByRole('button', { name: /ver conversaciones anteriores/i })
    }

    it('exposes the history control as a real button in the tab order', async () => {
      renderPanel()
      await openPanel()

      const button = historyButton()

      expect(button.tagName).toBe('BUTTON')
      // A positive/negative tabindex would take it out of the natural order.
      expect(button).not.toHaveAttribute('tabindex')
    })

    it('reports through aria-expanded whether the conversation list is open', async () => {
      renderPanel()
      await openPanel()

      expect(historyButton()).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(historyButton())

      expect(historyButton()).toHaveAttribute('aria-expanded', 'true')
    })

    // #269's stopgap: the panel title was a <button> with this same label,
    // because nothing had been drawn. Two paths to one action, one of them
    // invisible, is worse than a single visible path — so the title reverts
    // to plain text and the head keeps exactly one history trigger.
    it('renders the panel title as plain text rather than a second hidden trigger', async () => {
      renderPanel()
      await openPanel()

      expect(screen.getByText('Preguntar sobre mi cursada')).toBeInTheDocument()
      // Only the floating trigger may still carry the title as its name.
      expect(screen.getAllByRole('button', { name: /preguntar sobre mi cursada/i })).toHaveLength(1)
      expect(historyButton()).not.toHaveTextContent('Preguntar sobre mi cursada')
    })

    it('counts the conversations once some of them are not the one on screen', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([
        summary({ id: 9, updatedAt: '2026-08-18T10:00' }),
        summary({ id: 5, updatedAt: '2026-08-17T10:00' }),
        summary({ id: 3, updatedAt: '2026-08-16T10:00' })
      ])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(9, [message(1, '¿Qué es un anillo?', { kind: 'not-found' })])
      )
      renderPanel()
      await openPanel()
      await screen.findByText('¿Qué es un anillo?')

      await waitFor(() => expect(historyButton()).toHaveTextContent('3'))
    })

    // The count lives INSIDE the button, and a button's aria-label overrides
    // its text content — so with a static label a sighted user sees "3" while
    // a screen-reader user perceives no count at all. Same information, two
    // classes of user: the asymmetry is the defect, not the wording.
    it('carries the count in the accessible name, not only in the visible text', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([
        summary({ id: 9, updatedAt: '2026-08-18T10:00' }),
        summary({ id: 5, updatedAt: '2026-08-17T10:00' }),
        summary({ id: 3, updatedAt: '2026-08-16T10:00' })
      ])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(9, [message(1, '¿Qué es un anillo?', { kind: 'not-found' })])
      )
      renderPanel()
      await openPanel()
      await screen.findByText('¿Qué es un anillo?')

      await waitFor(() => expect(historyButton()).toHaveAccessibleName(/3/))
    })

    // The number must never restate what the user is already looking at. One
    // conversation, and it is the one on screen — there is nothing to browse
    // to, so the icon stays (discoverability) and the count does not.
    it('omits the count when the only conversation is the one already on screen', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([summary({ id: 9, updatedAt: '2026-08-18T10:00' })])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(9, [message(1, '¿Qué es un anillo?', { kind: 'not-found' })])
      )
      renderPanel()
      await openPanel()
      await screen.findByText('¿Qué es un anillo?')

      expect(historyButton()).not.toHaveTextContent(/\d/)
    })

    it('omits the count when no conversation exists at all', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([])
      renderPanel()
      await openPanel()

      expect(historyButton()).not.toHaveTextContent(/\d/)
    })

    // The baseline is the thread being VIEWED, not simply "more than one".
    // On a blank new thread the user is viewing nothing, so a single stored
    // conversation is already something they cannot see.
    it('counts the single stored conversation while a blank new thread is being viewed', async () => {
      vi.mocked(askApi.listConversations).mockResolvedValue([summary({ id: 9, updatedAt: '2026-08-18T10:00' })])
      vi.mocked(askApi.getConversation).mockResolvedValue(
        conversation(9, [message(1, '¿Qué es un anillo?', { kind: 'not-found' })])
      )
      renderPanel()
      await openPanel()
      await screen.findByText('¿Qué es un anillo?')

      fireEvent.click(historyButton())
      fireEvent.click(screen.getByText('+ Conversación nueva'))

      await waitFor(() => expect(historyButton()).toHaveTextContent('1'))
    })
  })
})

// The panel is bounded by PERMISSION before it is bounded by health. "No CLI
// connected" is not an error — nothing was tried, so there is nothing to report
// as having failed.
describe('AskPanelContainer — no CLI connected', () => {
  beforeEach(() => {
    resetAskMocks()
    vi.mocked(askApi.preferences).mockResolvedValue(prefs([]))
  })

  it('never probes when nothing is connected', async () => {
    renderPanel()
    await openPanel()

    await screen.findByText(ASK_NO_CLI_CONNECTED.title)
    expect(askApi.probe).not.toHaveBeenCalled()
  })

  it('says what to do rather than what went wrong', async () => {
    renderPanel()
    await openPanel()

    expect(await screen.findByText(ASK_NO_CLI_CONNECTED.title)).toBeInTheDocument()
    expect(screen.getByText(ASK_NO_CLI_CONNECTED.detail)).toBeInTheDocument()
    // The CLI-missing copy is a different claim: it means the app LOOKED for
    // the CLI the student chose and did not find it.
    expect(screen.queryByText('No encontramos ese CLI')).not.toBeInTheDocument()
  })

  it('hands the user to Ajustes', async () => {
    const { onGoToAjustes } = renderPanel()
    await openPanel()

    fireEvent.click(await screen.findByRole('button', { name: 'Ir a Ajustes' }))

    expect(onGoToAjustes).toHaveBeenCalledTimes(1)
  })

  it('refuses to send', async () => {
    renderPanel()
    await openPanel()
    await screen.findByText(ASK_NO_CLI_CONNECTED.title)

    await ask('¿Qué entra en el parcial?')

    expect(askApi.question).not.toHaveBeenCalled()
  })
})

// Generated-artifact outcome line (cli-generated-artifacts spec "Transcript
// reporting is plain text, action-free, and transient"). The container is
// the ONLY place that threads `askTurnResponse.artifact` — a TRANSIENT field
// never persisted with history — into the live turn; these tests prove both
// the threading and its scoped lifetime (never survives a close/reopen or a
// freshly-submitted question).
describe('AskPanelContainer — generated artifact outcome', () => {
  beforeEach(resetAskMocks)

  it('renders the app-owned outcome line after a successful turn that reports one', async () => {
    vi.mocked(askApi.question).mockResolvedValue({
      conversationId: null,
      result: { kind: 'general', answer: 'Acá tenés tu resumen.' },
      artifact: { status: 'saved', fileName: 'resumen-parcial-1.md', subjectName: 'Álgebra' }
    })
    renderPanel()
    await openPanel()
    await ask('Armame un resumen del parcial 1')

    expect(await screen.findByText('Acá tenés tu resumen.')).toBeInTheDocument()
    expect(screen.getByText('Se guardó "resumen-parcial-1.md" en Álgebra.')).toBeInTheDocument()
  })

  // Persisted writes take the OTHER `onSuccess` branch (selection switches,
  // `localEntries` clears, `derivedEntries` takes over on refetch) — the
  // outcome line must still thread through that branch, not only the
  // not-saved one exercised above.
  it('renders the outcome line for a persisted turn too', async () => {
    vi.mocked(askApi.question).mockResolvedValue({
      conversationId: 7,
      result: { kind: 'not-found' },
      artifact: { status: 'dropped', reason: 'unknown-subject' }
    })
    vi.mocked(askApi.getConversation).mockResolvedValue(
      conversation(7, [message(1, 'Armame un resumen de Física', { kind: 'not-found' })])
    )
    renderPanel()
    await openPanel()
    await ask('Armame un resumen de Física')

    await waitFor(() => expect(askApi.getConversation).toHaveBeenCalledWith(7))
    expect(
      await screen.findByText('El modelo intentó generar un documento para una materia que no encontré. No se guardó.')
    ).toBeInTheDocument()
  })

  it('does not replay the outcome line once the panel is closed and reopened', async () => {
    vi.mocked(askApi.question).mockResolvedValue({
      conversationId: null,
      result: { kind: 'general', answer: 'Acá tenés tu resumen.' },
      artifact: { status: 'saved', fileName: 'resumen.md', subjectName: 'Álgebra' }
    })
    renderPanel()
    await openPanel()
    await ask('Armame un resumen')
    await screen.findByText('Se guardó "resumen.md" en Álgebra.')

    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    await openPanel()

    expect(screen.queryByText('Se guardó "resumen.md" en Álgebra.')).not.toBeInTheDocument()
  })

  it('does not carry a turn’s outcome line into a newly submitted question', async () => {
    vi.mocked(askApi.question).mockResolvedValueOnce({
      conversationId: null,
      result: { kind: 'general', answer: 'Primera respuesta.' },
      artifact: { status: 'saved', fileName: 'resumen.md', subjectName: 'Álgebra' }
    })
    renderPanel()
    await openPanel()
    await ask('Primera pregunta')
    await screen.findByText('Se guardó "resumen.md" en Álgebra.')

    vi.mocked(askApi.question).mockReturnValue(new Promise(() => {}))
    await ask('Segunda pregunta, sin pedir documento')

    expect(screen.queryByText('Se guardó "resumen.md" en Álgebra.')).not.toBeInTheDocument()
  })
})

// A model the app cannot spawn must not be on the menu. Main refuses a
// disconnected provider at the process boundary, so offering its models would
// be offering rows that answer nothing.
describe('AskPanelContainer — the picker follows the opt-in', () => {
  beforeEach(resetAskMocks)

  it('offers only the connected CLI models', async () => {
    vi.mocked(askApi.preferences).mockResolvedValue(prefs(['claude']))
    renderPanel()
    await openPanel()

    fireEvent.click(await screen.findByRole('button', { name: /sonnet 5/i }))

    expect(await screen.findByRole('group', { name: 'Claude Code' })).toBeInTheDocument()
    // Antigravity has baseline models, so its absence here is the permission
    // filter at work rather than an empty section being dropped.
    expect(screen.queryByRole('group', { name: 'Antigravity CLI' })).not.toBeInTheDocument()
  })

  // The choice lives in localStorage and can name a CLI disconnected since, or
  // never connected on this machine. Pinning the panel to it would leave it
  // unusable with a perfectly good CLI connected.
  it('falls back to a connected CLI when the remembered one is not', async () => {
    window.localStorage.setItem('ask.model', JSON.stringify({ provider: 'codex', modelId: 'gpt-5.5' }))
    vi.mocked(askApi.preferences).mockResolvedValue(prefs(['claude']))
    vi.mocked(askApi.probe).mockResolvedValue(status())

    renderPanel()
    await openPanel()

    await waitFor(() => expect(askApi.probe).toHaveBeenCalledWith('claude'))
    expect(askApi.probe).not.toHaveBeenCalledWith('codex')
  })
})
