// Pure budget trimming over BM25-ranked attachment chunks (attachment-fts-index
// design "Retrieval budget"; spec "Retrieval budget"). Mirrors
// `transcriptWindow.ts`'s budget-then-render shape, but with no
// newest-first-then-reverse step: `AskAttachmentIndexPort.search()` already
// returns chunks ranked best-match first (the chunk store's own `ORDER BY
// bm25(...)`), so keeping the longest prefix that fits under budget is
// EXACTLY "drop the lowest-ranked chunks whole, never split mid-chunk" —
// removing chunks from the tail one at a time until the running total fits
// is equivalent to keeping the longest budget-fitting prefix from the front.
import { ASK_RETRIEVAL_BUDGET_CHARS } from './limits'

/** One retrieved chunk, in the chunk store's own best-match-first BM25 order. */
export interface RetrievedAttachmentChunk {
  text: string
  /** Same value as the source attachment's manifest `displayName` (spec "Citation resolvability"). */
  displayName: string
  /** Same value as the source attachment's manifest `subjectName`. */
  subjectName: string
  /**
   * Chunk provenance for `retrievalDiversity.ts`'s near-duplicate detection
   * (`attachment_chunks.attachment_id` / `chunk_index`): adjacent chunk
   * indexes of the SAME attachment are overlapping 1000-char windows of the
   * same passage. Never rendered into the prompt — `promptBuilder.ts` reads
   * only the three fields above.
   */
  attachmentId: number
  chunkIndex: number
  /**
   * The chunk's 1-based source PDF page (page-number citations), `null` for
   * chunks of un-paged formats. Unlike `attachmentId`/`chunkIndex` above,
   * this one IS rendered: `promptBuilder.ts` puts it in the fragment header
   * so the model can carry it into an `archivo` citation.
   */
  page: number | null
}

/**
 * Keeps the longest best-ranked-first prefix of `chunks` whose total `text`
 * length stays within `budgetChars`, dropping the rest whole.
 */
export function computeRetrievalWindow(
  chunks: readonly RetrievedAttachmentChunk[],
  budgetChars: number = ASK_RETRIEVAL_BUDGET_CHARS
): readonly RetrievedAttachmentChunk[] {
  const included: RetrievedAttachmentChunk[] = []
  let used = 0

  for (const chunk of chunks) {
    const size = chunk.text.length
    if (used + size > budgetChars) {
      break
    }
    included.push(chunk)
    used += size
  }

  return included
}
