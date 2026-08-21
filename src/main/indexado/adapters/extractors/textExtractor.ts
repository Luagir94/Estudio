import path from 'node:path'
import * as nodeFs from 'node:fs/promises'
import { MAX_SPREADSHEET_SOURCE_BYTES } from '../../domain/limits'

/** Narrow injectable fs subset (same convention as `fileAttachmentStorage.ts`'s `AttachmentFsSubset`) — trivial to mock in the oversized-CSV test without writing a real 10 MiB fixture file. */
export interface TextExtractorFsSubset {
  stat(filePath: string): Promise<{ size: number }>
  readFile(filePath: string, encoding: 'utf8'): Promise<string>
}

// The spec's size-cap text names "XLSX/CSV" specifically — TXT/MD are
// plain prose, not spreadsheet-shaped data that can compress a huge cell
// grid into a small file, so only CSV is capped here.
const CAPPED_EXTENSIONS = new Set(['.csv'])

/**
 * Reads a TXT/MD/CSV file verbatim (spec "Format dispatch and size cap":
 * "Supported format extracts"). An oversized CSV resolves to an empty
 * string WITHOUT reading its content (spec: "XLSX/CSV over 10 MiB ...
 * without parsing") — the caller (indexadoService, slice 2b) maps empty
 * extraction to `not-indexable` the same way it does for a genuinely empty
 * file.
 */
export async function extractTextFileText(filePath: string, fs: TextExtractorFsSubset = nodeFs): Promise<string> {
  const extension = path.extname(filePath).toLowerCase()

  if (CAPPED_EXTENSIONS.has(extension)) {
    const stats = await fs.stat(filePath)
    if (stats.size >= MAX_SPREADSHEET_SOURCE_BYTES) {
      return ''
    }
  }

  return fs.readFile(filePath, 'utf8')
}
