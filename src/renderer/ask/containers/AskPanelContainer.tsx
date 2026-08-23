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
import type { AskArtifactReport } from '../../../shared/ipc/ask'
import type { ModelSelection } from '../../../shared/ipc/cli'
import {
  AskApiError,
  askApi,
  CLI_PREFERENCES_QUERY_KEY,
  CLI_MODELS_QUERY_KEY,
  cliStatusQueryKey
} from '../adapters/askApi'
import { readAskModel, writeAskModel } from '../adapters/modelPreference'
import { AskHistoryList } from '../components/AskHistoryList'
import { AskPanel } from '../components/AskPanel'
import { AskStateCard } from '../components/AskStateCard'
import { AskTrigger } from '../components/AskTrigger'
import { AskTranscript, type AskEntry, type AskEntryInput } from '../components/AskTranscript'
import {
  ASK_BASELINE_MODELS,
  ASK_NO_CLI_CONNECTED,
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

/** Parks the status query on a key of its own while nothing is connected, so it never collides with a real provider's entry. */
const NO_PROVIDER_QUERY_KEY = ['cli', 'status', null] as const

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
  // The LIVE turn's generated-artifact outcome (cli-generated-artifacts spec
  // "Transcript reporting is plain text, action-free, and transient") — kept
  // OUTSIDE `entries`/`localEntries` on purpose (design D6): it must render
  // for a turn whether that turn's result is a local, not-saved entry or the
  // freshly-persisted last entry `derivedEntries` picks up on refetch, and it
  // must NEVER be sourced from persisted history. Reset at every point that
  // moves the panel away from "the turn that just finished" — a fresh submit
  // or a close — so reopening a past conversation can never replay it.
  const [liveArtifact, setLiveArtifact] = useState<AskArtifactReport | undefined>(undefined)
  const nextId = useRef(FIRST_LOCAL_ENTRY_SEED)
  const queryClient = useQueryClient()

  // WHICH CLIs this panel is allowed to use. A settings read, not a probe — it
  // starts no process, so it may run on open.
  const { data: preferences } = useQuery({
    queryKey: CLI_PREFERENCES_QUERY_KEY,
    queryFn: askApi.preferences,
    enabled: open
  })

  // Connected AND last seen working. The opt-in alone is not enough to offer a
  // CLI's models: an opted-in CLI that is missing from the machine would fill
  // the menu with rows that answer nothing.
  //
  // `lastStatus` is a memory, so this can lag reality — a CLI uninstalled since
  // the last probe still looks available. Ajustes is where a fresh observation
  // comes from, and the panel's own probe of the SELECTED provider is what
  // catches it before a question is spent.
  const available = preferences
    ?.filter((entry) => entry.connected && entry.lastStatus === 'connected')
    .map((entry) => entry.provider)

  // The panel asks with whatever the student last chose, but that choice lives
  // in localStorage and can name a CLI they have since disconnected — or never
  // connected on this machine. Falling back to the first connected one keeps
  // the panel usable instead of pinning it to a CLI it may not spawn.
  const activeProvider = available?.includes(model.provider) ? model.provider : available?.[0]

  // Only the CLI this panel is about to ASK with, never all three: the other
  // two would be processes spawned to produce values this container drops on
  // the next line. It shares Ajustes' per-provider cache entry, so a CLI
  // already probed there is not probed again here.
  const { data: status } = useQuery({
    queryKey: activeProvider ? cliStatusQueryKey(activeProvider) : NO_PROVIDER_QUERY_KEY,
    // The guard is a real check rather than a cast: `enabled` below already
    // stops this from running without a provider, and a narrowing that depends
    // on that staying true is a narrowing waiting to be wrong.
    queryFn: () => {
      if (!activeProvider) throw new Error('no connected CLI to probe')
      return askApi.probe(activeProvider)
    },
    // Refetched on open: the user may have just fixed the path in Ajustes.
    // Never enabled without a connected provider — that is the same opt-in gate
    // the settings screen enforces, stated again on the surface that spawns.
    enabled: open && activeProvider !== undefined
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
    onSuccess: ({ conversationId, result, artifact }) => {
      // Set unconditionally, BEFORE the branch below: a generated-artifact
      // outcome is independent of whether the ANSWER itself got persisted, so
      // both the persisted and not-saved branches must report it the same way.
      setLiveArtifact(artifact)

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

  // Cancel covers close, unmount AND the composer's stop control: a question
  // left running would keep spending the user's own tokens. Swallowed on
  // purpose at all three sites. On the teardown paths a rejected cancel would
  // surface as an unhandled rejection with nothing left on screen to report
  // it to; on the stop control everything the user sees arrives through the
  // question promise itself — main settles it as CANCELED, which `onError`
  // maps to the app's own "Cancelaste la consulta" line. Main already logs
  // the real cause.
  const cancelQuietly = (): void => {
    void askApi.cancel().catch(() => {})
  }

  const close = (): void => {
    setOpen(false)
    setLocalEntries([])
    setLiveArtifact(undefined)
    setDraft('')
    setHistoryOpen(false)
    cancelQuietly()
  }

  useEffect(() => cancelQuietly, [])

  // Derived at render, never cached in state: the build is pure and its
  // discovered half is already cached by TanStack Query.
  const modelGroups = buildModelGroups({
    baseline: ASK_BASELINE_MODELS,
    recommended: ASK_RECOMMENDED_MODELS,
    discovered: discoveredModels ?? [],
    // Undefined while the read is in flight: offering nothing for a moment is
    // honest, whereas offering all three would flash CLIs the student may not
    // have connected.
    available: available ?? []
  })

  // No CLI connected at all is its own state, not an error. Nothing was tried,
  // so there is nothing to report as having failed — the panel says what to do
  // rather than what went wrong.
  const noneConnected = available !== undefined && available.length === 0

  // A CLI whose installed version rejects the options this app needs is
  // "connected" and still unusable, so the capability observation is part of
  // the gate rather than a footnote.
  const degraded =
    noneConnected ||
    (status !== undefined && (status.status !== 'connected' || status.capabilities?.structuredOutput === false))
  const degradedCopy = noneConnected
    ? ASK_NO_CLI_CONNECTED
    : describeAskError(status?.status === 'not-found' ? 'CLI_NOT_FOUND' : 'CLI_UNUSABLE')

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
    // The PREVIOUS turn's outcome line belongs to that turn, not to whatever
    // is about to run — clearing it here keeps it from lingering under a
    // brand-new, unrelated pending question.
    setLiveArtifact(undefined)
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
          onCancel={cancelQuietly}
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
              <AskTranscript entries={entries} liveArtifact={liveArtifact} />
              {mutation.isPending && <AskStateCard icon={Loader} busy {...ASK_PENDING} />}
            </>
          )}
        </AskPanel>
      )}
    </>
  )
}
