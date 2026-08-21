import mammoth from 'mammoth'

/**
 * Extracts the plain text of a DOCX file (spec "Format dispatch and size
 * cap": "Supported format extracts"). `extractRawText` ignores styling —
 * exactly what chunking/indexing needs, no HTML/markdown noise. A malformed
 * DOCX/ZIP rejects; the caller (indexadoService, slice 2b) is the extraction
 * boundary that catches that and maps it to `not-indexable` (spec "Corrupt
 * file fails gracefully").
 */
export async function extractDocxText(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value
}
