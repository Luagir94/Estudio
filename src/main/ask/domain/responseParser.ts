import { z } from 'zod'
import { askResultSchema, type AskResult } from '../../../shared/ipc/ask'
import type { EnvelopeKind } from '../../cli/providerSpec'

// Two-layer parse (design D5), now across THREE providers: an outer envelope
// that belongs to whichever CLI produced it, wrapping the model's inner JSON
// as a string, optionally fence-wrapped, validated against the discriminated
// `askResultSchema`.
//
// Only the OUTER layer differs per provider. That is the whole design: every
// CLI is asked for the same inner contract, so a Gemini answer and a Claude
// answer are the same typed value by the time anything downstream sees them,
// and not one branch of `askService` or the renderer has to know which CLI ran.
//
// ANY failure — drifted envelope, bad inner JSON, or zero citations on an
// answer — is `MALFORMED_RESPONSE`; raw text is NEVER surfaced as an answer.
// Exit codes are `askService`'s concern, not this module's.

// zod-lenient throughout: unknown fields are stripped, because these envelopes
// belong to other people's programs and WILL grow fields without warning.
const claudeEnvelopeSchema = z.object({ result: z.string() })

// `{ response, stats, error }` per the headless-mode reference. `error` is
// what a failed Gemini run reports INSIDE a zero-exit envelope, so it has to
// be read here — an errored run is not an answer, even when `response` is
// also present.
const geminiEnvelopeSchema = z.object({
  response: z.string(),
  error: z.object({ message: z.string() }).nullish()
})

// One `item.completed` event carrying the final assistant turn. `codex exec
// --json` emits a JSONL stream of these; the agent's message is the one whose
// item type says so.
const codexAgentMessageSchema = z.object({
  type: z.literal('item.completed'),
  item: z.object({ type: z.literal('agent_message'), text: z.string() })
})

const FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/

export type ParseAskResponseResult = { ok: true; data: AskResult } | { ok: false; code: 'MALFORMED_RESPONSE' }

const malformed: ParseAskResponseResult = { ok: false, code: 'MALFORMED_RESPONSE' }

/**
 * Parses raw CLI stdout into a typed `AskResult`, or a typed
 * `MALFORMED_RESPONSE` on any failure.
 *
 * `envelope` defaults to Claude's shape so every existing caller and test
 * keeps its exact meaning — adding providers changed no behavior for the one
 * that was already there.
 */
export function parseAskResponse(rawStdout: string, envelope: EnvelopeKind = 'claude-json'): ParseAskResponseResult {
  const inner = extractInnerText(rawStdout, envelope)
  if (inner === undefined) {
    return malformed
  }

  const parsedInner = safeJsonParse(stripFence(inner))
  if (parsedInner === undefined) {
    return malformed
  }

  const parsed = askResultSchema.safeParse(parsedInner)
  return parsed.success ? { ok: true, data: parsed.data } : malformed
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

  if (envelope === 'gemini-json') {
    const result = geminiEnvelopeSchema.safeParse(found)
    // A reported error is a failed run wearing a successful envelope. Reading
    // `response` past it would surface the CLI's own failure text as if the
    // model had answered the student's question.
    if (!result.success || (result.data.error?.message ?? '') !== '') {
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
