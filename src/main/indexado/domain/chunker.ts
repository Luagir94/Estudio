// Pure text chunker (attachment-fts-index design "Technical Approach", spec
// "Chunking"). No fs/electron/sqlite import here by convention — this
// module stays framework-free so it can be unit-tested with plain strings.
import { CHUNK_OVERLAP_CHARS, CHUNK_SIZE_CHARS } from './limits'

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
