// Pure extension → format dispatcher (attachment-fts-index design "Technical
// Approach", spec "Format dispatch and size cap"). An unsupported extension
// returns `null` — it NEVER throws, so a caller can treat "not indexable" as
// data instead of catching an exception (spec "Unsupported extension
// skipped": "no extraction attempted").
import path from 'node:path'

export type ExtractionFormat = 'pdf' | 'docx' | 'text' | 'spreadsheet'

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
