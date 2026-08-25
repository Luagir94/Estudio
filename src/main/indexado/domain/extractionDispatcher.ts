// Pure extension → format dispatcher (attachment-fts-index design "Technical
// Approach", spec "Format dispatch and size cap"). An unsupported extension
// returns `null` — it NEVER throws, so a caller can treat "not indexable" as
// data instead of catching an exception (spec "Unsupported extension
// skipped": "no extraction attempted").
import path from 'node:path'

export type ExtractionFormat = 'pdf' | 'docx' | 'text' | 'spreadsheet'

/**
 * One page of extracted text, `page` 1-based, in document order
 * (page-number citations). Produced only by page-aware extractors (PDF);
 * un-paged formats keep yielding one flat string.
 */
export interface ExtractedPage {
  page: number
  text: string
}

/**
 * What an extractor yields: un-paged flat text (docx/text/spreadsheet, the
 * pre-existing contract) OR an ordered page list (PDF). The `null` /
 * `not-indexable` semantics are untouched: an unsupported extension still
 * short-circuits via `detectExtractionFormat` returning `null`, and a
 * document whose extraction carries no indexable text (empty string, or
 * every page empty) is still mapped to `not-indexable` by the service.
 */
export type ExtractionResult = string | readonly ExtractedPage[]

const EXTENSION_FORMATS: Readonly<Record<string, ExtractionFormat>> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.txt': 'text',
  '.md': 'text',
  '.csv': 'text',
  '.xlsx': 'spreadsheet'
}

export function detectExtractionFormat(fileName: string): ExtractionFormat | null {
  const extension = path.extname(fileName).toLowerCase()
  return EXTENSION_FORMATS[extension] ?? null
}
