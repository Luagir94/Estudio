import * as nodeFs from 'node:fs/promises'
import type { ChildProcess } from 'node:child_process'
import { format } from 'date-fns'
import log from 'electron-log'
import { resolveExecutable } from '../claude/domain/executableResolver'
import {
  clearProvider,
  spawnPromptExecution,
  terminateSpawnedProcess,
  validateArgvPrompt,
  validateExecutableCandidate,
  validateModelId,
  type ClearedProvider,
  type ValidatedArgvPrompt,
  type ValidatedExecutablePath,
  type ValidatedModelId
} from '../claude/claudeExecutableValidator'
import { PROVIDER_SPECS } from '../cli/providerSpec'
import { type AppSettingsPort, type TimeoutHandle } from '../cli/cliProbeService'
import { buildAppContext, type AppContext } from './domain/appContext'
import { buildAskPrompt, type AskManifestSubject } from './domain/promptBuilder'
import { parseAskResponse, type ParseFailureReason } from './domain/responseParser'
import type { EnvelopeKind } from '../cli/providerSpec'
import { stripAttachmentEcho } from './domain/attachmentEchoFilter'
import { buildRetrievalQuery } from './domain/retrievalQuery'
import { selectDiverseChunks } from './domain/retrievalDiversity'
import { computeRetrievalWindow, type RetrievedAttachmentChunk } from './domain/retrievalWindow'
import { computeTranscriptWindow, type TranscriptSourceTurn } from './domain/transcriptWindow'
import type { ArtifactExtraction } from './domain/artifactBlock'
import { validateArtifact } from './domain/artifactGate'
import {
  ASK_MAX_FILE_BYTES,
  ASK_MAX_STDERR_DETAIL_BYTES,
  ASK_MAX_STDOUT_BYTES,
  ASK_RETRIEVAL_CANDIDATES,
  ASK_RETRIEVAL_DIVERSITY_MIN_GAP,
  ASK_RETRIEVAL_TOP_K,
  ASK_TIMEOUT_MS
} from './domain/limits'
import type { AskArtifactReport, AskErrorCode, AskResult } from '../../shared/ipc/ask'
import type { CliProvider, ModelSelection } from '../../shared/ipc/cli'

// Orchestrates one question end to end (design D3/D4): override → resolve →
// validate → manifest → pre-spawn size gate → compose prompt → argv-length
// gate → spawn → stdin (or argv) → buffered stdout → typed outcome. It
// deliberately REPEATS the probe service's small
// resolve/validate chain instead of refactoring it, so Change A's files stay
// untouched except the validator itself.
//
// Every external effect is injected exactly as in `cliProbeService.ts`,
// so all twelve typed branches are provable without a real process. Nothing
// here imports `child_process` — only the validator may.

import type { ProbedCapabilities } from '../cli/capabilityProbe'

export type { ProbedCapabilities }

/**
 * The narrow slices of the subject and attachment registries this service
 * needs. Defined HERE (the probe service's `AppSettingsPort` convention) so
 * this file stays dead-code-safe on its own; the real repositories satisfy
 * them structurally.
 */
export interface AskSubjectPort {
  list(): readonly { id: number; name: string }[]
}

export interface AskAttachmentPort {
  listBySubject(subjectId: number): readonly { fileName: string; storedPath: string; sizeBytes: number }[]
}

/**
 * BM25 top-K retrieval over indexed attachment chunks
 * (attachment-fts-index design "Port Contracts" — consumer-owned, same
 * `AskAttachmentPort` structural convention above). `sqliteChunkStore.ts`'s
 * `ChunkStore.search` satisfies this structurally: same `(question,
 * maxChunks)` signature, same `{text, displayName, subjectName,
 * attachmentId, chunkIndex}` shape. `attachmentId`/`chunkIndex` are not
 * display fields: they feed the near-duplicate clustering in
 * `selectDiverseChunks`, so an adapter that fakes them with constants
 * silently disables diversity re-ranking — every chunk would cluster with
 * every other chunk of the same fake attachment.
 */
export interface AskAttachmentIndexPort {
  search(question: string, maxChunks: number): readonly RetrievedAttachmentChunk[]
}

/**
 * Consumer-owned port (design "Port Contract + Orchestration", same
 * `AttachmentIndexerPort` convention as `attachmentService.ts`) for the
 * SINGLE call site where a validated, subject-resolved artifact is actually
 * written to disk. `attachmentService.addGeneratedAttachment` satisfies this
 * structurally; wired once in `src/main/index.ts`.
 */
export interface AskGeneratedArtifactPort {
  saveGenerated(input: {
    subjectId: number
    fileName: string
    content: string
  }): Promise<{ ok: true } | { ok: false; message: string }>
}

/**
 * The app's own rows. THIS is the port an MCP server replaces: swap the
 * implementation and the service keeps the same control flow.
 */
export interface AskAppDataPort {
  read(): AppContext
}

/**
 * One turn as read back from persistence. Shape mirrors what
 * `sqliteAskHistoryRepository`'s `getConversation` returns per message
 * (`id`, not `messageId` — that repository's own field name), so the real
 * repository satisfies this port structurally, the same convention as
 * `AskSubjectPort`/`AskAttachmentPort` above.
 */
export interface AskHistoryTurn {
  id: number
  question: string
  model: string
  result: AskResult
  createdAt: string
}

export interface AskHistoryConversation {
  messages: readonly AskHistoryTurn[]
}

export interface AskHistoryAppendInput {
  /** `null` starts a new conversation; an existing id appends to it. */
  conversationId: number | null
  question: string
  model: string
  result: AskResult
  createdAt: string
}

export interface AskHistoryAppendResult {
  conversationId: number
  messageId: number
}

/**
 * The read/write seam for conversation persistence (design D1). `askService`
 * owns both the window load (READ, feeds the prompt) and the write hook
 * (WRITE, on a completed outcome only) behind ONE port — "one port, one
 * owner, one atomic view of a turn," per the design's own rejection of a
 * sibling wrapper service. Resolved to `getConversation` — PR1's repository
 * and PR2a's tasks already built and shipped that name; D1's `listTurns`
 * was a naming slip in the design text, not a second method (orchestrator
 * resolution, recorded in apply-progress).
 */
export interface AskHistoryPort {
  /** `null` when the conversation does not exist — mapped to typed `NOT_FOUND`, always before any spawn. */
  getConversation(id: number): AskHistoryConversation | null
  appendTurn(input: AskHistoryAppendInput): AskHistoryAppendResult
}

/**
 * `message` carries a technical detail or the offending file names — never
 * user-facing copy, which the renderer owns. `conversationId`/`messageId`
 * are REQUIRED on the success branch (design D1) — `persistTurn` is the
 * ONLY place that produces an `ok: true` outcome, and it always sets both
 * fields to either a real id or `null`. Making them required (closed in
 * PR2b-handlers, per validation #260) means a future success branch that
 * forgets to set them is a compile error, not a silently `undefined` value
 * that a careless `?? null` at the handler could collapse into the SAME
 * shape as an honest write failure. When `conversationId` is `null`, the
 * turn's answer is real but was NOT saved (persistence-failure honesty) —
 * never a thread-selection value.
 */
export type AskOutcome =
  | {
      ok: true
      data: AskResult
      conversationId: number | null
      messageId: number | null
      /**
       * OPTIONAL and TRANSIENT (design D6, cli-generated-artifacts spec
       * "Transcript reporting is plain text, action-free, and transient") —
       * present only when the response carried an artifact block, and NEVER
       * forwarded into `history.appendTurn` (no leakage into persisted
       * history).
       */
      artifact?: AskArtifactReport
    }
  // `reason` travels ONLY on MALFORMED_RESPONSE: a content-free tag naming
  // which parse layer refused the run. The IPC layer never forwards it
  // (`ipcErr` picks code+message) — it exists for the audit log and for
  // in-process consumers, never for the renderer, whose copy is fixed.
  | { ok: false; code: AskErrorCode; message?: string; reason?: ParseFailureReason }

export interface AskServiceDeps {
  settings: AppSettingsPort
  subjectRepository: AskSubjectPort
  attachmentRepository: AskAttachmentPort
  /**
   * Required (attachment-fts-index design "Port Contracts"), same closed-
   * bridge convention `history` uses below: `src/main/index.ts` wires the
   * real `sqliteChunkStore` in, so a missing wire is a compile error, not a
   * silent runtime degrade. An index with nothing indexed yet degrades
   * gracefully on its own (`search` returning `[]` → no retrieval section,
   * spec "Graceful degradation") — no separate no-op branch needed here.
   */
  attachmentIndex: AskAttachmentIndexPort
  appData: AskAppDataPort
  /** App-computed `userData/attachments`; re-asserted inside the validator before it reaches any command line. */
  attachmentsRoot: string
  /**
   * Required (closed in PR2b-handlers): `src/main/index.ts` now wires the
   * real `sqliteAskHistoryRepository` in. A missing `history` dep is a
   * compile error rather than a runtime degrade — the whole point of
   * closing this bridge is that the compiler, not a running app, is what
   * reminds the next caller to wire it (design D1, validation #260).
   */
  history: AskHistoryPort
  /**
   * Required (same closed-bridge convention as `history`/`attachmentIndex`
   * above): `src/main/index.ts` wires the real `attachmentService` in as this
   * port. This is the ONE port whose method call is the bounded exception to
   * "model output never triggers an app action" (design "Validation Gate").
   */
  generatedArtifacts: AskGeneratedArtifactPort
  resolve?: (executableName: string) => Promise<string | null>
  validate?: (candidatePath: string) => Promise<ValidatedExecutablePath | null>
  spawnPrompt?: (
    provider: ClearedProvider,
    absPath: ValidatedExecutablePath,
    attachmentsRoot: string,
    model: ValidatedModelId,
    /** The question, for an `argv`-delivery provider only; `null` when it travels on stdin. */
    prompt: ValidatedArgvPrompt | null
  ) => ChildProcess
  /**
   * What the connection probe observed for each provider. Returning `null`
   * (the default) means nothing was observed, which clears ONLY the providers
   * whose argv template was verified at authoring time — today, all three.
   */
  capabilities?: (provider: CliProvider) => ProbedCapabilities | null
  terminate?: (child: ChildProcess) => void
  timeoutMs?: number
  maxStdoutBytes?: number
  now?: () => number
  scheduleTimeout?: (callback: () => void, ms: number) => TimeoutHandle
  clearScheduledTimeout?: (handle: TimeoutHandle) => void
  logger?: Pick<typeof log, 'info'>
}

export interface AskService {
  ask(question: string, selection: ModelSelection, conversationId?: number): Promise<AskOutcome>
  /** Best-effort: kills the in-flight tree and settles its pending question as `CANCELED`. No-op when idle. */
  cancel(): void
}

interface ExecutionOutcome {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  canceled: boolean
  overflowed: boolean
  spawnErrorCode?: string
}

/** The single in-flight slot; `settleCanceled` is installed once the child exists. */
interface InFlight {
  settleCanceled: (() => void) | null
}

const defaultResolve = (executableName: string): Promise<string | null> =>
  resolveExecutable(executableName, { env: process.env, fs: nodeFs })

const defaultValidate = (candidatePath: string): Promise<ValidatedExecutablePath | null> =>
  validateExecutableCandidate(candidatePath, { fs: nodeFs })

export function createAskService({
  settings,
  subjectRepository,
  attachmentRepository,
  attachmentIndex,
  appData,
  attachmentsRoot,
  history,
  generatedArtifacts,
  resolve = defaultResolve,
  validate = defaultValidate,
  // The real spawn takes its injected `spawnFn` before the prompt (see
  // `spawnPromptExecution`), so `undefined` here is what keeps its default.
  spawnPrompt = (provider, absPath, root, model, prompt) =>
    spawnPromptExecution(provider, absPath, root, model, undefined, prompt),
  terminate = terminateSpawnedProcess,
  capabilities = () => null,
  timeoutMs = ASK_TIMEOUT_MS,
  maxStdoutBytes = ASK_MAX_STDOUT_BYTES,
  now = Date.now,
  scheduleTimeout = (callback, ms) => setTimeout(callback, ms),
  clearScheduledTimeout = (handle) => clearTimeout(handle),
  logger = log
}: AskServiceDeps): AskService {
  let inFlight: InFlight | null = null

  async function ask(question: string, selection: ModelSelection, conversationId?: number): Promise<AskOutcome> {
    // Claimed SYNCHRONOUSLY, before the first await — checking after one
    // would let a second question slip through the gap and spawn a second
    // process against the user's own quota.
    if (inFlight) {
      return { ok: false, code: 'BUSY' }
    }
    const slot: InFlight = { settleCanceled: null }
    inFlight = slot

    try {
      return await run(question, selection, conversationId, slot)
    } finally {
      inFlight = null
    }
  }

  async function run(
    question: string,
    selection: ModelSelection,
    conversationId: number | undefined,
    slot: InFlight
  ): Promise<AskOutcome> {
    // Resolved BEFORE any executable resolution/validation — a thread that
    // does not exist never reaches a spawn (design D1, spec "before any spawn").
    let transcript: readonly TranscriptSourceTurn[] = []
    if (conversationId !== undefined) {
      const conversation = history.getConversation(conversationId)
      if (!conversation) {
        logger.info(`ask: conversationId=${conversationId} not found — no process started`)
        return { ok: false, code: 'NOT_FOUND' }
      }
      const turns: TranscriptSourceTurn[] = conversation.messages.map((message) => ({
        messageId: message.id,
        question: message.question,
        result: message.result
      }))
      // Same source of truth the `ask:getConversation` handler will use for
      // the boundary marker (design D2) — one function, no drift.
      transcript = computeTranscriptWindow(turns).included
    }

    // The provider decides everything downstream: which executable is looked
    // for, which settings key holds its override, which argv template is used
    // and which envelope the answer is read out of.
    const spec = PROVIDER_SPECS[selection.provider]

    // The OPT-IN gate, enforced where it actually matters. The renderer stops
    // offering a disconnected CLI's models, but the renderer is never the thing
    // that decides a spawn is allowed: a drifted or stale panel could still
    // name one, and "the app only runs the CLIs you connected" has to be true
    // of the process boundary, not of a menu.
    if (settings.get(spec.connectedKey) === null) {
      logger.info(`ask: provider=${selection.provider} is not connected — no process started`)
      return { ok: false, code: 'CLI_NOT_FOUND' }
    }

    // A provider whose template was never run against a real binary cannot be
    // spawned on the strength of its documentation alone. `clearProvider`
    // returns the branded form only for a verified template or a probe that
    // observed structured output, and nothing else type-checks into a spawn.
    const cleared = clearProvider(selection.provider, capabilities(selection.provider))
    if (!cleared) {
      logger.info(`ask: provider=${selection.provider} template unverified on this machine — no process started`)
      return { ok: false, code: 'CLI_UNUSABLE' }
    }

    // Re-asserted here even though the IPC schema already checked it: this is
    // the last point before a string that reaches the cmd.exe command line,
    // and the branded return is what the spawn signature demands.
    const model = validateModelId(selection.modelId)
    if (!model) {
      logger.info(`ask: provider=${selection.provider} rejected model id — no process started`)
      return { ok: false, code: 'VALIDATION_ERROR', message: 'invalid model id' }
    }

    const overridePath = settings.get(spec.overrideKey)
    const source = overridePath ? 'override' : 'auto'
    const candidatePath = overridePath ?? (await resolve(spec.executableName))

    if (!candidatePath) {
      logger.info(`ask: provider=${selection.provider} source=${source} no executable resolved — no process started`)
      return { ok: false, code: 'CLI_NOT_FOUND' }
    }

    // Validation gates the SPAWN, exactly as in the probe (spec "Pre-Spawn
    // Validation"). A saved-but-broken override is reported, never rewritten.
    const validated = await validate(candidatePath)
    if (!validated) {
      logger.info(`ask: path=${candidatePath} source=${source} rejected by pre-spawn validation — no process started`)
      return { ok: false, code: 'CLI_UNUSABLE' }
    }

    // No empty-corpus gate: an app with nothing in it is a valid question, and
    // the answer comes back marked `general` rather than refused.
    const { subjects, oversized } = composeManifest()

    // App-side gate, never the model's job (design D3 rev 2): `sizeBytes` is
    // what was persisted at upload time.
    if (oversized.length > 0) {
      logger.info(`ask: source=${source} ${oversized.length} attachment(s) over the size ceiling — no process started`)
      return { ok: false, code: 'OVERSIZED_ATTACHMENT', message: oversized.join(', ') }
    }

    // Scoped BM25 retrieval, diversity-selected down to top-K and trimmed to
    // the char budget (design "Retrieval + Prompt"). Chunks are untrusted
    // file content — reaching `buildAskPrompt` is what wraps them in the
    // sentinel-protected section; nothing indexed yet means `search` returns
    // `[]`, the window stays empty, and the prompt below is byte-identical
    // to pre-change behavior.
    // The QUERY (never the prompt's question line) is enriched with the
    // newest answered turn so a keyword-free follow-up still retrieves the
    // chunks its topic lives in — then stripped of tokens that echo the
    // attachment filenames, because title tokens are the rarest in the corpus
    // and OR-joined BM25 would rank front matter over content. The WHOLE
    // enriched query is filtered: title tokens are identity echo wherever
    // they appear, including in appended prior-turn text.
    // The search fetches a WIDER candidate pool than the window holds, and
    // `selectDiverseChunks` picks the top-K from it: adjacent overlapping
    // chunk windows of one attachment are near-copies of one passage, and
    // the raw BM25 prefix would spend several of the six slots on them. The
    // final window is still at most `ASK_RETRIEVAL_TOP_K` chunks under the
    // same char budget — prompt size cannot grow from this.
    const attachmentFileNames = subjects.flatMap((subject) => subject.files.map((file) => file.displayName))
    const retrievedChunks = computeRetrievalWindow(
      selectDiverseChunks(
        attachmentIndex.search(
          stripAttachmentEcho(buildRetrievalQuery(question, transcript), attachmentFileNames),
          ASK_RETRIEVAL_CANDIDATES
        ),
        ASK_RETRIEVAL_TOP_K,
        ASK_RETRIEVAL_DIVERSITY_MIN_GAP
      )
    )

    // Composed BEFORE the spawn, not after it, because for an `argv` provider
    // the prompt is part of the command line the spawn is about to build.
    const prompt = buildAskPrompt(buildAppContext(appData.read()), subjects, question, transcript, retrievedChunks)

    // The argv ceiling applies to argv delivery and nowhere else: a question
    // that travels on stdin has no command-line limit to exceed, and inflicting
    // one on it would refuse a question the CLI would have answered. Over the
    // ceiling the app refuses BEFORE spawning — never truncates, which would
    // ask the model a different question than the student did.
    let argvPrompt: ValidatedArgvPrompt | null = null
    if (spec.promptDelivery === 'argv') {
      argvPrompt = validateArgvPrompt(prompt)
      if (!argvPrompt) {
        logger.info(
          `ask: provider=${selection.provider} prompt of ${prompt.length} chars exceeds the argv ceiling — no process started`
        )
        return { ok: false, code: 'PROMPT_TOO_LARGE' }
      }
    }

    const startedAt = now()
    let child: ChildProcess
    try {
      child = spawnPrompt(cleared, validated, attachmentsRoot, model, argvPrompt)
    } catch (error) {
      // The validator's root re-assertion threw: an app-invariant breach,
      // surfaced honestly and never retried against a fallback directory.
      const detail = error instanceof Error ? error.message : 'spawn rejected'
      logger.info(`ask: path=${validated} source=${source} spawn rejected — ${detail}`)
      return { ok: false, code: 'EXECUTION_FAILED', message: detail }
    }

    // `null` means the question already travelled on argv, so there is nothing
    // to write: an argv provider's stdin is closed at spawn.
    const outcome = await runExecution(child, argvPrompt === null ? prompt : null, slot)

    // Audit line (design D3): never the question text, never document content.
    logger.info(
      `ask: path=${validated} source=${source} provider=${selection.provider} model=${model} exitCode=${outcome.exitCode ?? 'null'} durationMs=${now() - startedAt} timedOut=${outcome.timedOut} canceled=${outcome.canceled} stdoutBytes=${outcome.stdout.length}`
    )

    const mapped = mapOutcome(outcome, spec.envelope)
    if (!mapped.ok) {
      // The parse-layer tag is the ONLY diagnostic a malformed run leaves
      // behind — the audit line above proves the run completed, this one says
      // which layer refused it. Content-free by construction (a closed
      // three-value tag), so it never violates the no-content log rule.
      if (mapped.reason !== undefined) {
        logger.info(`ask: malformed response layer=${mapped.reason}`)
      }
      // Typed errors are NEVER persisted (design D1, Decision 2) — including
      // CANCELED, which reaches here through the same branch.
      return mapped
    }

    // THE bounded exception (design "Validation Gate", spec "Bounded
    // exception to 'model output never triggers an app action'"): the SINGLE
    // call site in the whole app where model output triggers a real write.
    // Runs between `mapOutcome` and `persistTurn` — never before mapping
    // (an unparsed answer has nothing to gate) and never inside `persistTurn`
    // (the artifact report must never leak into what gets persisted).
    const artifact = await resolveArtifact(mapped.artifact)

    return persistTurn(mapped, conversationId, question, selection, artifact)
  }

  /**
   * Validates the pre-gate extraction, saves a valid one through the
   * `generatedArtifacts` port, and returns the transient report — `undefined`
   * when no block was present at all (spec "No artifact block leaves the
   * report field absent"). A save rejection is treated identically to an
   * `{ok:false}` result (both surface as `failed`); either way the model's
   * answer text is never affected, only this report.
   */
  async function resolveArtifact(extraction: ArtifactExtraction): Promise<AskArtifactReport | undefined> {
    const gate = validateArtifact(extraction, subjectRepository.list())

    let report: AskArtifactReport | undefined
    if (gate.kind === 'valid') {
      try {
        const saved = await generatedArtifacts.saveGenerated({
          subjectId: gate.subjectId,
          fileName: gate.fileName,
          content: gate.content
        })
        report = saved.ok
          ? { status: 'saved', fileName: gate.fileName, subjectName: gate.subjectName }
          : { status: 'failed', fileName: gate.fileName, subjectName: gate.subjectName }
      } catch {
        report = { status: 'failed', fileName: gate.fileName, subjectName: gate.subjectName }
      }
    } else if (gate.kind === 'dropped') {
      report = { status: 'dropped', reason: gate.reason }
    }

    // Audit line: outcome + reason + byte size — NEVER the content itself.
    logger.info(
      `ask: artifact outcome=${report?.status ?? 'none'} reason=${gate.kind === 'dropped' ? gate.reason : 'n/a'} bytes=${gate.kind === 'valid' ? Buffer.byteLength(gate.content, 'utf8') : 0}`
    )

    return report
  }

  /**
   * Write-on-completion (design D1, spec "Write-on-Completion Turn
   * Persistence"): runs only for a completed `answer`/`general`/`not-found`
   * outcome. A good answer is NEVER discarded — if `appendTurn` throws
   * (including an FK failure when the thread was deleted mid-flight), the
   * failure is logged and the answer still returns, with `conversationId:
   * null` as the ONLY per-turn write-failure signal.
   *
   * `artifact` is threaded into the RETURNED outcome only — `history.appendTurn`
   * below receives `result: outcome.data` alone, never `artifact` (design D6,
   * spec "Explicit discriminated-union artifact outcome report": the artifact
   * must never leak into persisted history).
   */
  function persistTurn(
    outcome: { ok: true; data: AskResult },
    conversationId: number | undefined,
    question: string,
    selection: ModelSelection,
    artifact: AskArtifactReport | undefined
  ): AskOutcome {
    try {
      const appended = history.appendTurn({
        conversationId: conversationId ?? null,
        question,
        // Stored as `provider:model` so a saved turn still says WHICH CLI
        // answered it. The read side is a plain string precisely so a
        // persisted row can outlive the shape the writer used.
        model: `${selection.provider}:${selection.modelId}`,
        result: outcome.data,
        createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm")
      })
      return {
        ok: true,
        data: outcome.data,
        conversationId: appended.conversationId,
        messageId: appended.messageId,
        ...(artifact ? { artifact } : {})
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error'
      logger.info(`ask: appendTurn failed for conversationId=${conversationId ?? 'new'} — turn NOT saved: ${detail}`)
      return { ok: true, data: outcome.data, conversationId: null, messageId: null, ...(artifact ? { artifact } : {}) }
    }
  }

  function composeManifest(): { subjects: AskManifestSubject[]; oversized: string[] } {
    const subjects: AskManifestSubject[] = []
    const oversized: string[] = []

    for (const subject of subjectRepository.list()) {
      const attachments = attachmentRepository.listBySubject(subject.id)
      if (attachments.length === 0) {
        continue
      }

      for (const attachment of attachments) {
        if (attachment.sizeBytes > ASK_MAX_FILE_BYTES) {
          oversized.push(attachment.fileName)
        }
      }

      subjects.push({
        subjectName: subject.name,
        files: attachments.map((attachment) => ({
          displayName: attachment.fileName,
          storedPath: attachment.storedPath
        }))
      })
    }

    return { subjects, oversized }
  }

  /**
   * Runs one spawned execution to completion — exit, spawn error, cancel,
   * output cap, or the hard timeout.
   *
   * `prompt` is `null` for a provider whose question already travelled on argv:
   * its stdin was closed at spawn and there is nothing left to deliver.
   */
  function runExecution(child: ChildProcess, prompt: string | null, slot: InFlight): Promise<ExecutionOutcome> {
    return new Promise((resolveOutcome) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      let timer: TimeoutHandle

      const base = (): ExecutionOutcome => ({
        exitCode: null,
        stdout,
        stderr,
        timedOut: false,
        canceled: false,
        overflowed: false
      })

      const finish = (outcome: ExecutionOutcome): void => {
        if (settled) return
        settled = true
        clearScheduledTimeout(timer)
        slot.settleCanceled = null
        resolveOutcome(outcome)
      }

      timer = scheduleTimeout(() => {
        if (settled) return
        terminate(child)
        finish({ ...base(), timedOut: true })
      }, timeoutMs)

      slot.settleCanceled = () => {
        if (settled) return
        terminate(child)
        finish({ ...base(), canceled: true })
      }

      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += String(chunk)
        // Kill on crossing rather than buffering a flood to exhaustion first.
        if (stdout.length > maxStdoutBytes && !settled) {
          terminate(child)
          finish({ ...base(), overflowed: true })
        }
      })

      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += String(chunk)
      })

      child.once('error', (error: NodeJS.ErrnoException) => {
        finish({ ...base(), spawnErrorCode: error.code })
      })

      child.once('close', (code: number | null) => {
        finish({ ...base(), exitCode: code })
      })

      // Where the question travels for every provider that can take it on
      // stdin — the whole reason those templates have no argument slot at all.
      if (prompt !== null) {
        child.stdin?.write(prompt)
        child.stdin?.end()
      }
    })
  }

  function cancel(): void {
    inFlight?.settleCanceled?.()
  }

  return { ask, cancel }
}

/**
 * The execution result BEFORE persistence decides `conversationId`/`messageId`
 * (design D1) — deliberately narrower than `AskOutcome`'s ok branch, which
 * only `persistTurn` is allowed to produce. Kept as its own type rather than
 * widening `AskOutcome` back to optional fields (validation #260): a
 * pre-persistence outcome and a fully-settled one are different facts and
 * must stay different types.
 *
 * `artifact` carries the PRE-GATE `ArtifactExtraction` unchanged from
 * `parseAskResponse`'s ok-branch (cli-generated-artifacts design "Wire
 * Format") — no validation has run yet. Named distinctly from the post-gate
 * `AskArtifactReport` on `AskOutcome`, which `resolveArtifact`/`persistTurn`
 * produce after the gate runs.
 */
type MappedExecutionOutcome =
  | { ok: true; data: AskResult; artifact: ArtifactExtraction }
  | { ok: false; code: AskErrorCode; message?: string; reason?: ParseFailureReason }

function mapOutcome(outcome: ExecutionOutcome, envelope: EnvelopeKind): MappedExecutionOutcome {
  // A path that validated but vanished before spawn is honestly `not-found`,
  // the same race honesty the probe applies.
  if (outcome.spawnErrorCode === 'ENOENT') {
    return { ok: false, code: 'CLI_NOT_FOUND' }
  }
  if (outcome.canceled) {
    return { ok: false, code: 'CANCELED' }
  }
  if (outcome.timedOut) {
    return { ok: false, code: 'TIMEOUT' }
  }
  if (outcome.overflowed) {
    return { ok: false, code: 'OUTPUT_TOO_LARGE' }
  }
  if (outcome.spawnErrorCode !== undefined) {
    return { ok: false, code: 'EXECUTION_FAILED', message: outcome.spawnErrorCode }
  }
  if (outcome.exitCode !== 0) {
    return {
      ok: false,
      code: 'EXECUTION_FAILED',
      message: firstLine(outcome.stderr) ?? `Exited with code ${outcome.exitCode ?? 'unknown'}`
    }
  }

  // A clean exit with NOTHING on stdout is not an empty answer, it is a run
  // that produced no output at all — verified for agy, whose headless mode
  // auto-denies a tool permission it cannot prompt for and then exits 0 in
  // silence, with the reason on stderr. Reporting that as a drifted envelope
  // would throw away the one line that explains it.
  if (outcome.stdout.trim() === '') {
    return {
      ok: false,
      code: 'EXECUTION_FAILED',
      message: firstLine(outcome.stderr) ?? 'the CLI exited cleanly without producing any output'
    }
  }

  const parsed = parseAskResponse(outcome.stdout, envelope)
  return parsed.ok
    ? { ok: true, data: parsed.data, artifact: parsed.artifact }
    : { ok: false, code: parsed.code, reason: parsed.reason }
}

function firstLine(text: string): string | null {
  return (
    text
      .slice(0, ASK_MAX_STDERR_DETAIL_BYTES)
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0) ?? null
  )
}
