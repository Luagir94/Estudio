import { describe, expect, it } from 'vitest'
import type { RetrievedAttachmentChunk } from './retrievalWindow'
import { selectDiverseChunks } from './retrievalDiversity'

// BM25 top-K alone can fill the tiny retrieval window with near-copies of ONE
// passage: chunks are fixed 1000-char windows with 120-char overlap, so
// adjacent chunk_index values of the same attachment share text and rank
// together. Replay evidence: a content query returned chunk_index 385 AND 386
// of the same attachment inside the top-6 — one passage occupying two of six
// slots. These tests pin the fix: fetch a wider candidate pool, then greedily
// keep the best-ranked chunk of each near-duplicate cluster (pass 1), and fill
// any leftover slots back from the rejected candidates in relevance order
// (pass 2) so diversity can never SHRINK the window versus the plain prefix.

function chunk(attachmentId: number, chunkIndex: number, text?: string): RetrievedAttachmentChunk {
  return {
    text: text ?? `texto-${attachmentId}-${chunkIndex}`,
    displayName: `apunte-${attachmentId}.pdf`,
    subjectName: 'Álgebra',
    attachmentId,
    chunkIndex
  }
}

describe('selectDiverseChunks', () => {
  // The replayed production case: adjacent overlapping windows 385/386 of the
  // same attachment are near-copies — only the better-ranked one may survive
  // pass 1, and the freed slot goes to a genuinely different passage.
  it('dedupes adjacent same-attachment chunks, keeping the better-ranked one (the 385/386 replay)', () => {
    const candidates = [chunk(7, 385), chunk(7, 386), chunk(9, 10)]

    const selected = selectDiverseChunks(candidates, 2, 3)

    expect(selected).toEqual([chunk(7, 385), chunk(9, 10)])
  })

  it('never treats close chunk indexes of DIFFERENT attachments as duplicates', () => {
    const candidates = [chunk(1, 5), chunk(2, 6)]

    const selected = selectDiverseChunks(candidates, 2, 3)

    expect(selected).toEqual([chunk(1, 5), chunk(2, 6)])
  })

  it('allows a same-attachment delta of exactly minGap', () => {
    const candidates = [chunk(1, 10), chunk(1, 13)]

    const selected = selectDiverseChunks(candidates, 2, 3)

    expect(selected).toEqual([chunk(1, 10), chunk(1, 13)])
  })

  it('rejects a same-attachment delta of minGap - 1 in pass 1 when a diverse candidate can take the slot', () => {
    const candidates = [chunk(1, 10), chunk(1, 12), chunk(2, 0)]

    const selected = selectDiverseChunks(candidates, 2, 3)

    expect(selected).toEqual([chunk(1, 10), chunk(2, 0)])
  })

  // The delta is a distance, not a direction: a LOWER neighboring index is
  // just as much the same overlapping passage as a higher one.
  it('rejects a near-duplicate whose chunkIndex is BELOW the accepted one', () => {
    const candidates = [chunk(1, 386), chunk(1, 385), chunk(2, 0)]

    const selected = selectDiverseChunks(candidates, 2, 3)

    expect(selected).toEqual([chunk(1, 386), chunk(2, 0)])
  })

  // The relevance-fallback guarantee: an all-adjacent candidate pool must
  // still fill the window — diversity may never return FEWER chunks than the
  // plain prefix take would have. The pool is strictly larger than the
  // window here, so the maxChunks >= candidates.length prefix shortcut
  // cannot short-circuit and mask a broken pass 2.
  it('falls back to rejected candidates (pass 2) to return exactly min(maxChunks, candidates.length)', () => {
    const candidates = [chunk(1, 0), chunk(1, 1), chunk(1, 2)]

    const selected = selectDiverseChunks(candidates, 2, 3)

    expect(selected).toEqual([chunk(1, 0), chunk(1, 1)])
  })

  it('keeps the final result in original BM25 order even when pass 2 admits an earlier-rejected candidate', () => {
    // Pass 1 accepts #100 and #5 (rejecting #101 and #102 as near-copies);
    // pass 2 re-admits #101, which must slot back into its ORIGINAL rank
    // position between #100 and #5, not be appended after the pass-1 picks.
    const candidates = [chunk(1, 100), chunk(1, 101), chunk(1, 102), chunk(2, 5)]

    const selected = selectDiverseChunks(candidates, 3, 3)

    expect(selected).toEqual([chunk(1, 100), chunk(1, 101), chunk(2, 5)])
  })

  it('checks conflicts against ACCEPTED chunks only — a rejected candidate never vetoes a later one', () => {
    // #2 is rejected against accepted #0 (delta 2 < 3). #4 sits within
    // minGap of the REJECTED #2 but at delta 4 from the accepted #0 — it
    // must be accepted, because only accepted chunks define the clusters.
    const candidates = [chunk(1, 0), chunk(1, 2), chunk(1, 4)]

    const selected = selectDiverseChunks(candidates, 2, 3)

    expect(selected).toEqual([chunk(1, 0), chunk(1, 4)])
  })

  it('stops pass 1 as soon as maxChunks are accepted, dropping lower-ranked diverse candidates', () => {
    const candidates = [chunk(1, 0), chunk(2, 0), chunk(3, 0), chunk(4, 0)]

    const selected = selectDiverseChunks(candidates, 2, 3)

    expect(selected).toEqual([chunk(1, 0), chunk(2, 0)])
  })

  it('returns an empty array for empty candidates', () => {
    expect(selectDiverseChunks([], 6, 3)).toEqual([])
  })

  it('returns every candidate in order when maxChunks exceeds the candidate count', () => {
    const candidates = [chunk(1, 0), chunk(1, 1)]

    const selected = selectDiverseChunks(candidates, 6, 3)

    expect(selected).toEqual([chunk(1, 0), chunk(1, 1)])
  })

  it('degenerates to a plain prefix take when minGap is 1', () => {
    const candidates = [chunk(1, 0), chunk(1, 1), chunk(1, 2)]

    const selected = selectDiverseChunks(candidates, 2, 1)

    expect(selected).toEqual([chunk(1, 0), chunk(1, 1)])
  })

  it('degenerates to a plain prefix take when minGap is 0', () => {
    const candidates = [chunk(1, 0), chunk(1, 0), chunk(1, 1)]

    const selected = selectDiverseChunks(candidates, 2, 0)

    expect(selected).toEqual([chunk(1, 0), chunk(1, 0)])
  })

  it('returns an empty array when maxChunks is 0', () => {
    expect(selectDiverseChunks([chunk(1, 0)], 0, 3)).toEqual([])
  })

  it('never mutates the candidates array (pure)', () => {
    const candidates = [chunk(1, 0), chunk(1, 1), chunk(2, 0)]
    const snapshot = candidates.map((entry) => ({ ...entry }))

    selectDiverseChunks(candidates, 2, 3)

    expect(candidates).toEqual(snapshot)
  })
})
