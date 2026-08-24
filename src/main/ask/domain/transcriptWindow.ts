// Pure windowing over a conversation's prior turns (design D2, spec
// "Size-Bounded Transcript Window" / "Memory-Boundary Honesty Marker").
//
// One source of truth: `askService` calls `computeTranscriptWindow` to build
// the prompt, and the `ask:getConversation` handler calls the SAME function
// over the SAME repository turns to produce the boundary marker. Because
// `serializeTranscriptTurn` is the only measurement used by both, the
// marker can never drift from what the model actually saw — a second
// serializer would silently reintroduce that drift.
import type { AskResult } from '../../../shared/ipc/ask'
import { ASK_TRANSCRIPT_BUDGET_CHARS } from './limits'

/** One prior turn as read from persistence — citations are deliberately not part of this shape (design D3: omitted from serialization). */
export interface TranscriptSourceTurn {
  messageId: number
  question: string
  result: AskResult
}

export interface TranscriptWindowResult {
  /** Chronological order (oldest included first) — the same order the prompt and the transcript UI render in. */
  included: readonly TranscriptSourceTurn[]
  /** The oldest included turn's id, or `null` when nothing fits (design D2 edge case). */
  startMessageId: number | null
  /** How many prior turns were dropped whole to stay within budget. */
  excludedCount: number
}

// Never model text (design D3) — the model produced no answer for this
// turn, so nothing of its own is available to replay into a later prompt.
const NOT_FOUND_TRANSCRIPT_LINE = '(no se pudo responder desde la cursada)'

function answerTextOf(result: AskResult): string {
  return result.kind === 'not-found' ? NOT_FOUND_TRANSCRIPT_LINE : result.answer
}

/**
 * Renders one turn to the exact text that both the prompt and the budget
 * measurement use. Deterministic and pure: same turn in, same string out.
 */
export function serializeTranscriptTurn(turn: TranscriptSourceTurn): string {
  return `Pregunta previa: ${turn.question}\nRespuesta previa (${turn.result.kind}): ${answerTextOf(turn.result)}`
}

/**
 * Accumulates turns newest-first, whole turns only (never split mid-turn),
 * while the running sum of `serializeTranscriptTurn(t).length` stays within
 * `budgetChars`. Returns the included turns back in chronological order.
 *
 * Edge case: the newest turn alone exceeds the budget → `included` is
 * empty and `startMessageId` is `null` (design D2 — the boundary marker
 * then sits after the last message, since nothing was included).
 */
export function computeTranscriptWindow(
  turns: readonly TranscriptSourceTurn[],
  budgetChars: number = ASK_TRANSCRIPT_BUDGET_CHARS
): TranscriptWindowResult {
  const includedNewestFirst: TranscriptSourceTurn[] = []
  let used = 0

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (turn === undefined) {
      continue
    }
    const size = serializeTranscriptTurn(turn).length
    if (used + size > budgetChars) {
      break
    }
    includedNewestFirst.push(turn)
    used += size
  }

  const included = includedNewestFirst.reverse()

  return {
    included,
    startMessageId: included[0]?.messageId ?? null,
    excludedCount: turns.length - included.length
  }
}
