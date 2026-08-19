import * as nodeFs from 'node:fs/promises'
import type { ChildProcess } from 'node:child_process'
import { format } from 'date-fns'
import log from 'electron-log'
import { resolveExecutable } from '../claude/domain/executableResolver'
import {
  clearProvider,
  spawnPromptExecution,
  terminateSpawnedProcess,
  validateExecutableCandidate,
  validateModelId,
  type ClearedProvider,
  type ValidatedExecutablePath,
  type ValidatedModelId
} from '../claude/claudeExecutableValidator'
import { PROVIDER_SPECS } from '../cli/providerSpec'
import { type AppSettingsPort, type TimeoutHandle } from '../cli/cliProbeService'
import { buildAppContext, type AppContext } from './domain/appContext'
import { buildAskPrompt, type AskManifestSubject } from './domain/promptBuilder'
import { parseAskResponse } from './domain/responseParser'
import type { EnvelopeKind } from '../cli/providerSpec'
import { computeTranscriptWindow, type TranscriptSourceTurn } from './domain/transcriptWindow'
import { ASK_MAX_FILE_BYTES, ASK_MAX_STDERR_DETAIL_BYTES, ASK_MAX_STDOUT_BYTES, ASK_TIMEOUT_MS } from './domain/limits'
import type { AskErrorCode, AskResult } from '../../shared/ipc/ask'
import type { CliProvider, ModelSelection } from '../../shared/ipc/cli'

// Orchestrates one question end to end (design D3/D4): override → resolve →
// validate → manifest → pre-spawn size gate → spawn → stdin → buffered
// stdout → typed outcome. It deliberately REPEATS the probe service's small
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
  | { ok: true; data: AskResult; conversationId: number | null; messageId: number | null }
  | { ok: false; code: AskErrorCode; message?: string }

export interface AskServiceDeps {
  settings: AppSettingsPort
  subjectRepository: AskSubjectPort
  attachmentRepository: AskAttachmentPort
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
  resolve?: (executableName: string) => Promise<string | null>
  validate?: (candidatePath: string) => Promise<ValidatedExecutablePath | null>
  spawnPrompt?: (
    provider: ClearedProvider,
    absPath: ValidatedExecutablePath,
    attachmentsRoot: string,
    model: ValidatedModelId
  ) => ChildProcess
  /**
   * What the connection probe observed for each provider. Returning `null`
   * (the default) means nothing was observed, which clears ONLY the providers
   * whose argv template was verified at authoring time — today, just Claude.
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
  appData,
  attachmentsRoot,
  history,
  resolve = defaultResolve,
  validate = defaultValidate,
  spawnPrompt = spawnPromptExecution,
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

    const startedAt = now()
    let child: ChildProcess
    try {
      child = spawnPrompt(cleared, validated, attachmentsRoot, model)
    } catch (error) {
      // The validator's root re-assertion threw: an app-invariant breach,
      // surfaced honestly and never retried against a fallback directory.
      const detail = error instanceof Error ? error.message : 'spawn rejected'
      logger.info(`ask: path=${validated} source=${source} spawn rejected — ${detail}`)
      return { ok: false, code: 'EXECUTION_FAILED', message: detail }
    }

    const outcome = await runExecution(
      child,
      buildAskPrompt(buildAppContext(appData.read()), subjects, question, transcript),
      slot
    )

    // Audit line (design D3): never the question text, never document content.
    logger.info(
      `ask: path=${validated} source=${source} provider=${selection.provider} model=${model} exitCode=${outcome.exitCode ?? 'null'} durationMs=${now() - startedAt} timedOut=${outcome.timedOut} canceled=${outcome.canceled} stdoutBytes=${outcome.stdout.length}`
    )

    const mapped = mapOutcome(outcome, spec.envelope)
    if (!mapped.ok) {
      // Typed errors are NEVER persisted (design D1, Decision 2) — including
      // CANCELED, which reaches here through the same branch.
      return mapped
    }
    return persistTurn(mapped, conversationId, question, selection)
  }

  /**
   * Write-on-completion (design D1, spec "Write-on-Completion Turn
   * Persistence"): runs only for a completed `answer`/`general`/`not-found`
   * outcome. A good answer is NEVER discarded — if `appendTurn` throws
   * (including an FK failure when the thread was deleted mid-flight), the
   * failure is logged and the answer still returns, with `conversationId:
   * null` as the ONLY per-turn write-failure signal.
   */
  function persistTurn(
    outcome: { ok: true; data: AskResult },
    conversationId: number | undefined,
    question: string,
    selection: ModelSelection
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
      return { ok: true, data: outcome.data, conversationId: appended.conversationId, messageId: appended.messageId }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error'
      logger.info(`ask: appendTurn failed for conversationId=${conversationId ?? 'new'} — turn NOT saved: ${detail}`)
      return { ok: true, data: outcome.data, conversationId: null, messageId: null }
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

  /** Runs one spawned execution to completion — exit, spawn error, cancel, output cap, or the hard timeout. */
  function runExecution(child: ChildProcess, prompt: string, slot: InFlight): Promise<ExecutionOutcome> {
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

      // The question travels HERE, never on argv — the whole reason the
      // validator's template has no caller-supplied argument slot.
      child.stdin?.write(prompt)
      child.stdin?.end()
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
 */
type MappedExecutionOutcome = { ok: true; data: AskResult } | { ok: false; code: AskErrorCode; message?: string }

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

  const parsed = parseAskResponse(outcome.stdout, envelope)
  return parsed.ok ? { ok: true, data: parsed.data } : { ok: false, code: parsed.code }
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
