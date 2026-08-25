// Pure text chunker (attachment-fts-index design "Technical Approach", spec
// "Chunking"). No fs/electron/sqlite import here by convention — this
// module stays framework-free so it can be unit-tested with plain strings.
import type { ExtractedPage } from './extractionDispatcher'
import { CHUNK_OVERLAP_CHARS, CHUNK_SIZE_CHARS } from './limits'

/**
 * One chunk plus its source-page provenance (page-number citations):
 * `page` is the 1-based PDF page the chunk was cut from, or `null` for a
 * chunk of un-paged text (docx/text/spreadsheet).
 */
export interface PageTaggedChunk {
  text: string
  page: number | null
}

/**
 * Splits `text` into fixed-size chunks with a fixed overlap between
 * consecutive chunks (spec "Chunking": exactly `chunkSize` chars, exactly
 * `overlap` chars shared between neighbors, final chunk may be shorter).
 *
 * `step = chunkSize - overlap` is how far each chunk start advances; the
 * last `overlap` chars of one chunk are always the first `overlap` chars of
 * the next, because slice windows of size `chunkSize` starting `step` chars
 * apart share exactly `chunkSize - step = overlap` chars.
 */
export function chunkText(
  text: string,
  chunkSize: number = CHUNK_SIZE_CHARS,
  overlap: number = CHUNK_OVERLAP_CHARS
): string[] {
  if (text.length === 0) {
    return []
  }

  const step = chunkSize - overlap
  const chunks: string[] = []

  for (let start = 0; start < text.length; start += step) {
    const end = start + chunkSize
    chunks.push(text.slice(start, end))
    if (end >= text.length) {
      break
    }
  }

  return chunks
}

/**
 * Page-aware chunking (page-number citations): chunks EACH PAGE
 * INDEPENDENTLY with the exact same size/overlap rules as `chunkText`, so a
 * chunk never spans two pages and every chunk carries the page it was cut
 * from. An empty or whitespace-only page (a scanned page's text layer)
 * contributes no chunks at all. The returned array keeps document order —
 * the chunk store's positional `chunk_index` therefore remains one single
 * increasing sequence across the whole document.
 */
export function chunkPages(
  pages: readonly ExtractedPage[],
  chunkSize: number = CHUNK_SIZE_CHARS,
  overlap: number = CHUNK_OVERLAP_CHARS
): PageTaggedChunk[] {
  const chunks: PageTaggedChunk[] = []

  for (const { page, text } of pages) {
    if (text.trim().length === 0) {
      continue
    }
    for (const chunkTextValue of chunkText(text, chunkSize, overlap)) {
      chunks.push({ text: chunkTextValue, page })
    }
  }

  return chunks
}
