// Pure diversity re-ranking over a BM25 candidate pool. Taking the FTS top-6
// directly lets near-duplicate chunks monopolize the tiny retrieval window:
// chunks are fixed 1000-char windows with 120-char overlap, so adjacent
// chunk_index values of the same attachment are near-copies of one passage
// (replay: a content query returned chunk_index 385 AND 386 of the same
// attachment inside the top-6 — one passage in two of six slots). A "detail
// all of them" question then reads one passage six times instead of six
// passages once. The fix: fetch a wider candidate pool upstream, then greedily
// keep only the best-ranked representative of each near-duplicate cluster.
//
// This re-ranks WHICH chunks fill the window, never how many: pass 2 refills
// any slots diversity left empty from the rejected candidates, so the result
// always has exactly min(maxChunks, candidates.length) chunks — the window can
// only get more diverse than the plain prefix take, never smaller.
import type { RetrievedAttachmentChunk } from './retrievalWindow'

/**
 * Greedily selects up to `maxChunks` from `candidates` (already in
 * best-match-first BM25 order — that order IS the relevance signal):
 *
 * - PASS 1 walks the candidates in order and accepts each one unless an
 *   ALREADY-ACCEPTED chunk shares its `attachmentId` with a `chunkIndex`
 *   delta below `minGap` — rejected candidates never veto later ones,
 *   because only accepted chunks define the near-duplicate clusters.
 * - PASS 2 (relevance fallback) refills any remaining slots with the
 *   rejected candidates in their original order, so an all-adjacent pool
 *   still returns exactly min(maxChunks, candidates.length) chunks.
 *
 * The result keeps the original candidate order regardless of which pass
 * admitted each chunk. `minGap <= 1` degenerates to a plain prefix take —
 * a delta of 1 is the smallest distinct-chunk distance, so nothing below
 * it can ever be a near-duplicate boundary worth checking.
 */
export function selectDiverseChunks(
  candidates: readonly RetrievedAttachmentChunk[],
  maxChunks: number,
  minGap: number
): RetrievedAttachmentChunk[] {
  if (minGap <= 1 || maxChunks >= candidates.length) {
    return candidates.slice(0, Math.max(0, maxChunks))
  }

  const accepted = new Array<boolean>(candidates.length).fill(false)
  let acceptedCount = 0

  const conflictsWithAccepted = (candidate: RetrievedAttachmentChunk): boolean =>
    candidates.some(
      (other, index) =>
        accepted[index] &&
        other.attachmentId === candidate.attachmentId &&
        Math.abs(other.chunkIndex - candidate.chunkIndex) < minGap
    )

  for (let index = 0; index < candidates.length && acceptedCount < maxChunks; index += 1) {
    if (!conflictsWithAccepted(candidates[index])) {
      accepted[index] = true
      acceptedCount += 1
    }
  }

  // Relevance fallback: refill from the pass-1 rejects, best-ranked first.
  for (let index = 0; index < candidates.length && acceptedCount < maxChunks; index += 1) {
    if (!accepted[index]) {
      accepted[index] = true
      acceptedCount += 1
    }
  }

  return candidates.filter((_, index) => accepted[index])
}
