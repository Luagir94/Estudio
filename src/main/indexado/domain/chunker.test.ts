import { describe, expect, it } from 'vitest'
import { chunkText } from './chunker'

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
    expect(chunks[0].slice(-120)).toBe(chunks[1].slice(0, 120))
    expect(chunks[1].slice(-120)).toBe(chunks[2].slice(0, 120))
    // And the overlap content is the ACTUAL source text at that offset —
    // not a coincidental match (e.g. chunker returning constants).
    expect(chunks[0].slice(-120)).toBe(text.slice(880, 1000))
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
