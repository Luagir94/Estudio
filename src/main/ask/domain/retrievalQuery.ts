// Pure retrieval-query enrichment for follow-up questions. A follow-up like
// "¿Podés detallar cada uno?" carries no content keywords of its own —
// searched verbatim, BM25 matches nothing, the prompt ships without a
// retrieval section, and the model honestly answers not-found even though
// the topic sits one turn away. Borrowing the newest answered turn's text
// gives BM25 the topic words ("ERP", "CRM"…) the follow-up refers to.
//
// This enriches the SEARCH QUERY only. The question line the model reads is
// composed by `promptBuilder.ts` from the raw question and never sees this
// string — asking the model a different question than the student did is
// exactly what this module must never do. `ftsQuery.ts` OR-joins every
// token, so appending text can only ADD ranked candidates, never veto a
// match the raw question would have found.
import type { TranscriptSourceTurn } from './transcriptWindow'
import { ASK_RETRIEVAL_QUERY_CONTEXT_CHARS } from './limits'

/**
 * Appends the newest answered turn's question and answer to `question`,
 * capped at `contextChars`. Not-found turns are skipped whole: they
 * contributed no corpus-grounded text, and their question already failed to
 * surface anything once. With no transcript, or none but not-found turns,
 * the question returns unchanged — a first turn's query stays byte-identical
 * to pre-change behavior.
 */
export function buildRetrievalQuery(
  question: string,
  transcript: readonly TranscriptSourceTurn[],
  contextChars: number = ASK_RETRIEVAL_QUERY_CONTEXT_CHARS
): string {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const turn = transcript[index]
    if (turn === undefined || turn.result.kind === 'not-found') {
      continue
    }
    const context = `${turn.question}\n${turn.result.answer}`.slice(0, contextChars)
    return `${question}\n${context}`
  }

  return question
}
