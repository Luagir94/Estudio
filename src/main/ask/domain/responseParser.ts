import { z } from 'zod'
import { askResultSchema, type AskResult } from '../../../shared/ipc/ask'
import type { EnvelopeKind } from '../../cli/providerSpec'
import { splitArtifactBlock, type ArtifactExtraction } from './artifactBlock'

// Two-layer parse (design D5), now across THREE providers: an outer envelope
// that belongs to whichever CLI produced it, wrapping the model's inner JSON
// as a string, optionally fence-wrapped, validated against the discriminated
// `askResultSchema`.
//
// Only the OUTER layer differs per provider. That is the whole design: every
// CLI is asked for the same inner contract, so an Antigravity answer and a
// Claude answer are the same typed value by the time anything downstream sees
// them, and not one branch of `askService` or the renderer has to know which
// CLI ran.
//
// ANY failure — drifted envelope, bad inner JSON, or zero citations on an
// answer — is `MALFORMED_RESPONSE`; raw text is NEVER surfaced as an answer.
// Exit codes are `askService`'s concern, not this module's.

// zod-lenient throughout: unknown fields are stripped, because these envelopes
// belong to other people's programs and WILL grow fields without warning.
const claudeEnvelopeSchema = z.object({ result: z.string() })

// The single completion object `agy --output-format json` prints, captured from
// agy.exe 1.1.15. A successful run carries `status: "SUCCESS"` and NO `error`
// key at all, and `structured_output` appears only under `--json-schema`, so
// this schema requires neither — a shape that demanded them would reject every
// real answer.
//
// `status` is read as a free string rather than an enum on purpose. The values
// observed are SUCCESS, ERROR, CANCELED, INTERRUPTED, INVALID, WAITING and
// RUNNING, but the set belongs to somebody else's program: an unrecognised one
// must be treated as "not a success", never crash the parse into a shape that
// looks like drift.
const antigravityEnvelopeSchema = z.object({
  status: z.string(),
  response: z.string(),
  error: z.string().nullish()
})

// One `item.completed` event carrying the final assistant turn. `codex exec
// --json` emits a JSONL stream of these; the agent's message is the one whose
// item type says so.
const codexAgentMessageSchema = z.object({
  type: z.literal('item.completed'),
  item: z.object({ type: z.literal('agent_message'), text: z.string() })
})

const FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/

// `artifact` is the PRE-GATE extraction (cli-generated-artifacts design
// "Wire Format" / "Artifact block is split from the inner text before result
// parsing") — distinct from the post-gate `AskArtifactReport` that
// `artifactGate.ts`/`askService.ts` produce. It travels ONLY on the ok-branch:
// a malformed answer parse has nothing to report an artifact against.
export type ParseAskResponseResult =
  { ok: true; data: AskResult; artifact: ArtifactExtraction } | { ok: false; code: 'MALFORMED_RESPONSE' }

const malformed: ParseAskResponseResult = { ok: false, code: 'MALFORMED_RESPONSE' }

/**
 * Parses raw CLI stdout into a typed `AskResult`, or a typed
 * `MALFORMED_RESPONSE` on any failure.
 *
 * `envelope` defaults to Claude's shape so every existing caller and test
 * keeps its exact meaning — adding providers changed no behavior for the one
 * that was already there.
 *
 * Parse order (design D2): extractInnerText -> splitArtifactBlock ->
 * stripFence(resultText) -> JSON.parse -> `askResultSchema`. The split runs
 * BEFORE `stripFence` so a fenced result JSON followed by a sentinel-wrapped
 * artifact block still parses — the split, not the fence regex, is what
 * finds where the result JSON ends. A malformed artifact block never fails
 * the answer parse: the answer always survives a broken block.
 */
export function parseAskResponse(rawStdout: string, envelope: EnvelopeKind = 'claude-json'): ParseAskResponseResult {
  const inner = extractInnerText(rawStdout, envelope)
  if (inner === undefined) {
    return malformed
  }

  const { resultText, block } = splitArtifactBlock(inner)

  const parsedInner = safeJsonParse(stripFence(resultText))
  if (parsedInner === undefined) {
    return malformed
  }

  const parsed = askResultSchema.safeParse(parsedInner)
  return parsed.success ? { ok: true, data: parsed.data, artifact: block } : malformed
}

/** Peels the provider's own wrapper off, yielding the model's inner JSON text. */
function extractInnerText(rawStdout: string, envelope: EnvelopeKind): string | undefined {
  if (envelope === 'codex-jsonl') {
    return extractCodexAgentMessage(rawStdout)
  }

  const found = findEnvelope(rawStdout)
  if (found === undefined) {
    return undefined
  }

  if (envelope === 'antigravity-json') {
    const result = antigravityEnvelopeSchema.safeParse(found)
    if (!result.success) {
      return undefined
    }
    // TWO independent failure signals, and either one disqualifies the run —
    // both of which arrive on a ZERO exit, which is exactly why the exit code
    // cannot be what decides this. A non-SUCCESS status is a failed run even
    // when a response sits beside it, and a populated `error` is a failed run
    // wearing a successful envelope: reading `response` past either would
    // surface the CLI's own failure text as if the model had answered the
    // student's question.
    if (result.data.status !== 'SUCCESS' || (result.data.error ?? '') !== '') {
      return undefined
    }
    return result.data.response
  }

  const result = claudeEnvelopeSchema.safeParse(found)
  return result.success ? result.data.result : undefined
}

/**
 * Walks the JSONL stream for the LAST completed agent message.
 *
 * Last rather than first because a turn may complete more than one item, and
 * the answer this app asked for is the one the run ended on. Lines that are
 * not JSON, or are events of any other type, are skipped rather than failing
 * the parse — a JSONL stream is expected to carry many event kinds, and this
 * module is only interested in one of them.
 */
function extractCodexAgentMessage(rawStdout: string): string | undefined {
  const lines = rawStdout.split(/\r?\n/)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = safeJsonParse(lines[index].trim())
    if (parsed === undefined) {
      continue
    }
    const event = codexAgentMessageSchema.safeParse(parsed)
    if (event.success) {
      return event.data.item.text
    }
  }

  return undefined
}

/**
 * The CLI's stdout is not guaranteed to be JSON and nothing else: a real run
 * was observed emitting a failed-hook diagnostic alongside the payload, and
 * which stream that lands on was never established. Parsing the whole buffer
 * is tried FIRST so the clean case stays exact; only then does it fall back to
 * the last line that parses on its own, which is where a single-object JSON
 * output format puts the result.
 *
 * The fallback is deliberately line-scoped rather than a brace-matching
 * scrape: it accepts a complete JSON document that the CLI actually printed,
 * and nothing assembled out of fragments.
 */
function findEnvelope(rawStdout: string): unknown {
  const whole = safeJsonParse(rawStdout)
  if (whole !== undefined) {
    return whole
  }

  const lines = rawStdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = safeJsonParse(lines[index])
    if (parsed !== undefined) {
      return parsed
    }
  }

  return undefined
}

function stripFence(text: string): string {
  const trimmed = text.trim()
  const match = FENCE_PATTERN.exec(trimmed)
  return match ? match[1] : trimmed
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
