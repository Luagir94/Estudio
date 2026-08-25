import { describe, expect, it } from 'vitest'
import { chunkPages, chunkText } from './chunker'

// Deterministic fixture: each character position holds a unique letter (A-Z
// repeating), which makes overlap assertions exact instead of approximate —
// slicing the source at the same offsets the chunker uses must produce
// byte-identical substrings.
function markerText(length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(65 + (i % 26))
  }
  return out
}

describe('chunkText', () => {
  it('splits a 2500-char text into 1000-char chunks with a shorter final chunk (spec: Long text produces overlapping chunks)', () => {
    const text = markerText(2500)

    const chunks = chunkText(text)

    // step = CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS = 1000 - 120 = 880.
    // Starts at 0, 880, 1760; the third chunk runs 1760..2500 = 740 chars.
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(1000)
    expect(chunks[1]).toHaveLength(1000)
    expect(chunks[2]).toHaveLength(740)
  })

  it('produces exactly 120-char overlap between consecutive chunks', () => {
    const text = markerText(2500)

    const chunks = chunkText(text)

    // chunk[0]'s last 120 chars must equal chunk[1]'s first 120 chars —
    // proves real overlap, not just two adjacent non-overlapping slices.
    expect(chunks[0]!.slice(-120)).toBe(chunks[1]!.slice(0, 120))
    expect(chunks[1]!.slice(-120)).toBe(chunks[2]!.slice(0, 120))
    // And the overlap content is the ACTUAL source text at that offset —
    // not a coincidental match (e.g. chunker returning constants).
    expect(chunks[0]!.slice(-120)).toBe(text.slice(880, 1000))
  })

  it('returns a single chunk unchanged when the text is shorter than the chunk size', () => {
    const text = markerText(400)

    const chunks = chunkText(text)

    expect(chunks).toEqual([text])
  })

  it('returns an empty array for empty text', () => {
    expect(chunkText('')).toEqual([])
  })
})

// Page-aware chunking (page-number citations): each page is chunked
// INDEPENDENTLY — a chunk never spans two pages — and every chunk carries
// its 1-based source page. `chunk_index` stays a single increasing sequence
// across the whole document, which here means the returned array order IS
// the document order (the store indexes positionally).
describe('chunkPages', () => {
  it('chunks each page independently with the same size/overlap rules, tagging every chunk with its page', () => {
    const pages = [
      { page: 1, text: markerText(2500) },
      { page: 2, text: markerText(1500) }
    ]

    const chunks = chunkPages(pages)

    // Page 1 alone chunks exactly like chunkText(markerText(2500)): starts
    // at 0, 880, 1760. Page 2 restarts at 0: starts at 0, 880.
    expect(chunks).toHaveLength(5)
    expect(chunks.map((chunk) => chunk.page)).toEqual([1, 1, 1, 2, 2])
    expect(chunks[0]?.text).toBe(markerText(2500).slice(0, 1000))
    expect(chunks[2]?.text).toBe(markerText(2500).slice(1760, 2500))
    // The first chunk of page 2 starts at THAT page's offset 0 — proof no
    // chunk window ever spans the page boundary.
    expect(chunks[3]?.text).toBe(markerText(1500).slice(0, 1000))
    expect(chunks[4]?.text).toBe(markerText(1500).slice(880, 1500))
  })

  it('keeps the 120-char overlap within a page but never across pages', () => {
    const pages = [
      { page: 1, text: markerText(2500) },
      { page: 2, text: markerText(1500) }
    ]

    const chunks = chunkPages(pages)

    expect(chunks[0]!.text.slice(-120)).toBe(chunks[1]!.text.slice(0, 120))
    // Last chunk of page 1 and first chunk of page 2 share NO overlap
    // contract — page 2 simply starts at its own offset 0.
    expect(chunks[3]!.text).toBe(markerText(1500).slice(0, 1000))
  })

  it('produces no chunks for an empty page and no chunks for a whitespace-only page', () => {
    const pages = [
      { page: 1, text: '' },
      { page: 2, text: '  \n\t ' },
      { page: 3, text: 'contenido real de la tercera página' }
    ]

    const chunks = chunkPages(pages)

    expect(chunks).toEqual([{ text: 'contenido real de la tercera página', page: 3 }])
  })

  it('returns an empty array when every page is empty (scanned/image-only PDF)', () => {
    expect(
      chunkPages([
        { page: 1, text: '' },
        { page: 2, text: '   ' }
      ])
    ).toEqual([])
  })

  it('returns a single tagged chunk for a single short page', () => {
    expect(chunkPages([{ page: 1, text: 'hola' }])).toEqual([{ text: 'hola', page: 1 }])
  })

  it('honors explicit chunkSize/overlap parameters per page', () => {
    const chunks = chunkPages([{ page: 4, text: 'abcdefgh' }], 5, 2)

    // step = 3: starts at 0 ('abcde'), 3 ('defgh') — end 8 >= length stops.
    expect(chunks).toEqual([
      { text: 'abcde', page: 4 },
      { text: 'defgh', page: 4 }
    ])
  })
})
