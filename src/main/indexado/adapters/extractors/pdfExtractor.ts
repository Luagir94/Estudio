import fs from 'node:fs/promises'
// pdf-parse's package root (`pdf-parse/index.js`) runs a top-level
// "debug mode" check that, outside a normal `module.parent` context (e.g.
// under Vitest/ESM), tries to synchronously read a fixture PDF shipped
// inside its OWN package directory — throwing ENOENT here instead. The
// internal `lib/pdf-parse.js` path is the real parser with no such shim
// (design "Technical Approach": "pdf-parse via internal
// `pdf-parse/lib/pdf-parse.js` path to dodge the entry gotcha").
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

/**
 * Extracts the text layer of a PDF file (spec "Format dispatch and size
 * cap": "Supported format extracts"). A scanned/image-only PDF with no text
 * layer resolves successfully with an empty string — extraction "failing
 * silently" into emptiness is a normal outcome, not an error. A malformed
 * PDF that pdf-parse cannot open at all REJECTS; the caller (indexadoService,
 * slice 2b) is the extraction boundary that catches that and maps it to
 * `not-indexable` (spec "Corrupt file fails gracefully").
 */
export async function extractPdfText(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath)
  return withoutBufferPooling(async () => {
    const result = await pdfParse(buffer)
    return result.text
  })
}

/**
 * `pdf-parse@1.1.4`'s vendored pdf.js (v1.10.100) re-reads its input through
 * an internal Node-specific stream path that allocates from Node's shared
 * Buffer pool, then builds its cross-reference substream via `bytes.buffer`
 * — the raw underlying `ArrayBuffer` — while treating xref offsets as if
 * they were 0-indexed from that buffer's start. Whenever the pooled
 * allocation lands at a NONZERO `byteOffset` (routine for small files),
 * pdf.js reads from the wrong position and throws "bad XRef entry" on an
 * otherwise perfectly valid PDF (confirmed empirically: identical bytes
 * parse successfully once pooling is disabled). Zeroing `Buffer.poolSize`
 * for the duration of the call forces every allocation involved — ours and
 * pdf-parse's internal ones — to be a dedicated, byteOffset-0 buffer, then
 * restores the original pool size immediately after (even on rejection) so
 * unrelated code elsewhere in the process keeps using the pool normally.
 */
async function withoutBufferPooling<T>(run: () => Promise<T>): Promise<T> {
  const originalPoolSize = Buffer.poolSize
  Buffer.poolSize = 0
  try {
    return await run()
  } finally {
    Buffer.poolSize = originalPoolSize
  }
}
