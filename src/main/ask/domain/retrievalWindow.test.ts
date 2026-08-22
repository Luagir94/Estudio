import { describe, expect, it } from 'vitest'
import { computeRetrievalWindow, type RetrievedAttachmentChunk } from './retrievalWindow'

// Pure budget trimming over BM25-ranked chunks (attachment-fts-index design
// "Retrieval budget", spec "Retrieval budget" — "top-6 chunks totaling 9000
// characters ... lowest-ranked chunks are dropped whole until total ≤ 7000
// chars"). `chunks` arrives already ranked best-match-first (the chunk
// store's own `ORDER BY bm25(...)`), so the tests build fixtures in that
// same best-to-worst order.

function chunk(text: string, displayName = 'apunte.pdf', subjectName = 'Álgebra'): RetrievedAttachmentChunk {
  return { text, displayName, subjectName, attachmentId: 1, chunkIndex: 0 }
}

describe('computeRetrievalWindow', () => {
  it('keeps every chunk when the total is under budget', () => {
    const chunks = [chunk('a'.repeat(100)), chunk('b'.repeat(100)), chunk('c'.repeat(100))]

    const included = computeRetrievalWindow(chunks, 1000)

    expect(included).toEqual(chunks)
  })

  it('drops the lowest-ranked (last) chunks whole, never truncating mid-chunk, once the budget is exceeded', () => {
    // 6 chunks of 1500 chars each = 9000 total, budget 7000: chunks[0..3]
    // sum to 6000 (fits), adding chunks[4] would reach 7500 (over) — so only
    // the first 4, best-ranked chunks survive, each byte-identical to the
    // input (never sliced).
    const chunks = [
      chunk('1'.repeat(1500), 'a.pdf'),
      chunk('2'.repeat(1500), 'b.pdf'),
      chunk('3'.repeat(1500), 'c.pdf'),
      chunk('4'.repeat(1500), 'd.pdf'),
      chunk('5'.repeat(1500), 'e.pdf'),
      chunk('6'.repeat(1500), 'f.pdf')
    ]

    const included = computeRetrievalWindow(chunks, 7000)

    expect(included).toHaveLength(4)
    expect(included).toEqual(chunks.slice(0, 4))
    expect(included.reduce((sum, c) => sum + c.text.length, 0)).toBe(6000)
  })

  it('returns an empty array when even the best-ranked chunk alone exceeds the budget', () => {
    const chunks = [chunk('x'.repeat(500))]

    const included = computeRetrievalWindow(chunks, 100)

    expect(included).toEqual([])
  })

  it('returns an empty array for an empty input, without touching the budget', () => {
    expect(computeRetrievalWindow([], 7000)).toEqual([])
  })

  it('defaults to ASK_RETRIEVAL_BUDGET_CHARS (7000) when no budget is passed', () => {
    const chunks = [chunk('y'.repeat(6999)), chunk('z'.repeat(50))]

    const included = computeRetrievalWindow(chunks)

    // 6999 + 50 = 7049 > 7000 → the second, lower-ranked chunk is dropped.
    expect(included).toEqual([chunks[0]])
  })
})
