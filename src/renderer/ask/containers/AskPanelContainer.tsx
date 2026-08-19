// Container (design D6/D7): owns the open/closed state, thread selection,
// the durable transcript, the CLI status query and the ask mutation.
// Rendering belongs to the presentational components in `../components`.
//
// History is DURABLE (design D1): every completed turn is written by
// `askService`, and this container resumes the most recently updated
// conversation on mount. `ThreadSelection` is a discriminated state so "no
// thread chosen yet" and "the last write failed" (the `conversationId: null`
// sentinel) can never collapse into each other — see `ASK_NOT_SAVED` below.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Folder, Loader, Plug, SearchX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ModelSelection } from '../../../shared/ipc/cli'
import { AskApiError, askApi, CLI_MODELS_QUERY_KEY, CLI_STATUS_QUERY_KEY } from '../adapters/askApi'
import { readAskModel, writeAskModel } from '../adapters/modelPreference'
import { AskHistoryList } from '../components/AskHistoryList'
import { AskPanel } from '../components/AskPanel'
import { AskStateCard } from '../components/AskStateCard'
import { AskTrigger } from '../components/AskTrigger'
import { AskTranscript, type AskEntry, type AskEntryInput } from '../components/AskTranscript'
import {
  ASK_BASELINE_MODELS,
  ASK_MODEL_KNOWLEDGE,
  ASK_NOT_FOUND,
  ASK_PENDING,
  ASK_RECOMMENDED_MODELS,
  describeAskError
} from '../domain/askDisplay'
import { buildModelGroups } from '../domain/modelCatalog'
import { toEntries } from '../domain/historyEntries'
import { advanceLocalEntryId, FIRST_LOCAL_ENTRY_SEED } from '../domain/localEntryId'
import { activeConversationId, selectionAfterDelete, type ThreadSelection } from '../domain/threadSelection'

interface AskPanelContainerProps {
  /** Supplied by the Shell so the degraded state can hand the user to Ajustes. */
  onGoToAjustes: () => void
}

const CONVERSATIONS_QUERY_KEY = ['ask', 'conversations'] as const

function conversationQueryKey(id: number | null): readonly [string, string, number | null] {
  return ['ask', 'conversation', id]
}

export function AskPanelContainer({ onGoToAjustes }: AskPanelContainerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  // Read once from storage, then persisted on every change so the next
  // question — and the next session — keeps the choice.
  const [model, setModel] = useState<ModelSelection>(readAskModel)
  const [selection, setSelection] = useState<ThreadSelection>({ kind: 'resume' })
  // Browse mode (design #268 §3): swaps the content slot for the history
  // list. Orthogonal to `selection` — browsing never itself changes which
  // thread is active, only picking a row or starting a new one does.
  const [historyOpen, setHistoryOpen] = useState(false)
  // The in-flight question and anything a failed write left behind — merged
  // onto the derived (persisted) entries below.
  const [localEntries, setLocalEntries] = useState<readonly AskEntry[]>([])
  const nextId = useRef(FIRST_LOCAL_ENTRY_SEED)
  const queryClient = useQueryClient()

  const { data: statuses } = useQuery({
    queryKey: CLI_STATUS_QUERY_KEY,
    queryFn: askApi.status,
    // Refetched on open: the user may have just fixed the path in Ajustes.
    enabled: open
  })

  // What the INSTALLED CLI turned out to have, rather than what this app was
  // written knowing. It cannot be asked — no CLI of the three answers a
  // question about its own models — so the catalog reads the state file the
  // CLI already wrote, which costs no tokens and no spawn.
  //
  // `askApi.models` never rejects, so this query has no error branch to
  // render: finding nothing and failing to look are the same outcome here,
  // and both leave the picker showing exactly the curated list.
  const { data: discoveredModels } = useQuery({
    queryKey: CLI_MODELS_QUERY_KEY,
    queryFn: askApi.models,
    enabled: open
  })

  const { data: conversations } = useQuery({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: askApi.listConversations,
    enabled: open
  })

  // Pure derivation, computed at render time (never cached in an effect).
  const activeId = activeConversationId(selection, conversations ?? [])

  const { data: conversation } = useQuery({
    queryKey: conversationQueryKey(activeId),
    queryFn: () => askApi.getConversation(activeId as number),
    enabled: activeId != null
  })

  // Head count (design #273 §1), derived at render time from the list query
  // that is already loaded — no extra IPC call for a number we hold.
  //
  // The baseline is the thread being VIEWED, not simply "more than one":
  // showing "1" while that single conversation is on screen would tell the
  // user something they can already see. On a blank new thread nothing is
  // being viewed, so the baseline drops to 0 and one stored conversation is
  // already worth pointing at.
  const conversationTotal = conversations?.length ?? 0
  const conversationCount = conversationTotal > (activeId != null ? 1 : 0) ? conversationTotal : null

  const derivedEntries = conversation ? toEntries(conversation.messages, conversation.window) : []
  const entries: readonly AskEntry[] = [...derivedEntries, ...localEntries]

  const append = (entry: AskEntryInput): void => {
    const id = advanceLocalEntryId(nextId)
    setLocalEntries((previous) => [...previous, { ...entry, id } as AskEntry])
  }

  const mutation = useMutation({
    // `activeId == null` covers a brand-new thread and `'new'` alike: omit
    // `conversationId` entirely rather than pass an explicit `undefined`.
    mutationFn: (input: { question: string; model: ModelSelection }) =>
      activeId != null
        ? askApi.question(input.question, input.model, activeId)
        : askApi.question(input.question, input.model),
    onSuccess: ({ conversationId, result }) => {
      if (conversationId !== null) {
        // Persisted: the invalidated refetch becomes the source of truth for
        // this turn, so the optimistic local copy is dropped instead of
        // risking a duplicate.
        setSelection({ kind: 'thread', id: conversationId })
        setLocalEntries([])
        void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })
        void queryClient.invalidateQueries({ queryKey: conversationQueryKey(conversationId) })
        return
      }

      // Write failed: the answer is real, but nothing was persisted.
      // Selection stays exactly where it was and nothing is invalidated —
      // the turn survives only as a local entry, carrying the visible
      // not-saved marker directly under it (design #268 §2).
      if (result.kind === 'answer') {
        append({ kind: 'answer', text: result.answer, citations: result.citations, notSaved: true })
      } else if (result.kind === 'general') {
        append({ kind: 'general', text: result.answer, notSaved: true })
      } else {
        append({ kind: 'state', icon: SearchX, ...ASK_NOT_FOUND, notSaved: true })
      }
    },
    onError: (error) => {
      const code = error instanceof AskApiError ? error.code : 'EXECUTION_FAILED'
      const detail = error instanceof AskApiError ? error.message : undefined
      append({ kind: 'state', icon: Plug, ...describeAskError(code, detail) })
    }
  })

  // Delete's selection-reset rule lives in `selectionAfterDelete` (design D6,
  // tested at the domain level in `threadSelection.test.ts`); this is its
  // first call site — the browse list (design #268 §3) is the trigger.
  const deleteMutation = useMutation({
    mutationFn: (id: number) => askApi.deleteConversation(id),
    onSuccess: ({ id }) => {
      setSelection((previous) => selectionAfterDelete(previous, id))
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })
    }
  })

  // Cancel covers BOTH close and unmount: a question left running would keep
  // spending the user's own tokens with nothing left on screen to receive it.
  // Swallowed on purpose: both call sites are teardown paths, and a rejected
  // cancel there would surface as an unhandled rejection during unmount with
  // nothing left on screen to report it to. Main already logs the real cause.
  const cancelQuietly = (): void => {
    void askApi.cancel().catch(() => {})
  }

  const close = (): void => {
    setOpen(false)
    setLocalEntries([])
    setDraft('')
    setHistoryOpen(false)
    cancelQuietly()
  }

  useEffect(() => cancelQuietly, [])

  // The panel reports on the CLI it is about to ASK, not on Claude by
  // assumption: with three providers selectable, showing Claude's health while
  // the user has Gemini selected would be worse than showing nothing.
  const status = statuses?.find((entry) => entry.provider === model.provider)

  // Derived at render, never cached in state: the build is pure and its
  // discovered half is already cached by TanStack Query.
  const modelGroups = buildModelGroups({
    baseline: ASK_BASELINE_MODELS,
    knowledge: ASK_MODEL_KNOWLEDGE,
    recommended: ASK_RECOMMENDED_MODELS,
    discovered: discoveredModels ?? []
  })

  // A CLI whose installed version rejects the options this app needs is
  // "connected" and still unusable, so the capability observation is part of
  // the gate rather than a footnote.
  const degraded =
    status !== undefined && (status.status !== 'connected' || status.capabilities?.structuredOutput === false)
  const degradedCopy = describeAskError(status?.status === 'not-found' ? 'CLI_NOT_FOUND' : 'CLI_UNUSABLE')

  const handleSubmit = (): void => {
    const question = draft.trim()
    // Main re-checks the CLI anyway — this guard is for the user, not for
    // trust. The renderer is never the thing that decides a spawn is safe.
    //
    // `historyOpen` is here and not only on the composer's `disabled`:
    // while the list is up there is no thread on screen, so a send would
    // land in whatever thread sat behind it. Stating it at the send site
    // means the draft SURVIVES the browse instead of vanishing into a
    // conversation the user never had open.
    if (degraded || historyOpen || question.length === 0 || mutation.isPending) {
      return
    }
    append({ kind: 'question', text: question })
    setDraft('')
    mutation.mutate({ question, model })
  }

  return (
    <>
      {/* Stays mounted while the panel is open — the design keeps it on
          screen, so it is also the close affordance. */}
      <AskTrigger open={open} onClick={() => (open ? close() : setOpen(true))} />
      {open && (
        <AskPanel
          model={model}
          modelGroups={modelGroups}
          onModelChange={(next) => {
            setModel(next)
            writeAskModel(next)
          }}
          disabled={degraded}
          pending={mutation.isPending}
          value={draft}
          onValueChange={setDraft}
          onSubmit={handleSubmit}
          onClose={close}
          onToggleHistory={() => setHistoryOpen((previous) => !previous)}
          historyOpen={historyOpen}
          conversationCount={conversationCount}
        >
          {historyOpen ? (
            <AskHistoryList
              conversations={conversations ?? []}
              activeId={activeId}
              onSelect={(id) => {
                setSelection({ kind: 'thread', id })
                setHistoryOpen(false)
              }}
              onNewConversation={() => {
                setSelection({ kind: 'new' })
                setHistoryOpen(false)
              }}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ) : degraded ? (
            <AskStateCard
              icon={Plug}
              title={degradedCopy.title}
              detail={degradedCopy.detail}
              actionLabel="Ir a Ajustes"
              onAction={onGoToAjustes}
            />
          ) : (
            <>
              {entries.length === 0 && !mutation.isPending && (
                <AskStateCard
                  icon={Folder}
                  title="Preguntá sobre tu cursada"
                  detail="Respondo solo con lo que subiste, y siempre te digo de qué archivo lo saqué."
                />
              )}
              <AskTranscript entries={entries} />
              {mutation.isPending && <AskStateCard icon={Loader} busy {...ASK_PENDING} />}
            </>
          )}
        </AskPanel>
      )}
    </>
  )
}
